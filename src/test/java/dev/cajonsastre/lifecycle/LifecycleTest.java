package dev.cajonsastre.lifecycle;

import dev.cajonsastre.TestApi;
import dev.cajonsastre.http.LocalSecurity;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Ciclo de vida: C-03 a C-07 y S-20. */
class LifecycleTest {

    @TempDir
    Path dir;
    AtomicInteger shutdowns = new AtomicInteger();
    Presence presence;
    TestApi api;

    @BeforeEach
    void start() {
        presence = new Presence(shutdowns::incrementAndGet, Duration.ofMillis(300), () -> null);
        api = TestApi.start(List.of(new LifecycleApi(presence, shutdowns::incrementAndGet)));
    }

    @AfterEach
    void stop() {
        api.close();
        presence.close();
    }

    @Test
    void c04_the_events_channel_counts_as_a_connected_window() throws Exception {
        CompletableFuture<HttpResponse<InputStream>> events = HttpClient.newHttpClient().sendAsync(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + api.port() + "/api/events"))
                        .header(LocalSecurity.TOKEN_HEADER, TestApi.TOKEN)
                        // Como la interfaz (presence.ts).
                        .header("Accept", "text/event-stream").GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
        HttpResponse<InputStream> r = events.get(5, TimeUnit.SECONDS);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type")).hasValueSatisfying(v -> assertThat(v).contains("text/event-stream"));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (presence.connections() == 0 && System.nanoTime() < deadline) {
            Thread.onSpinWait();
        }
        assertThat(presence.connections()).isEqualTo(1);
        r.body().close();
    }

    @Test
    void c05_after_a_goodbye_without_windows_it_shuts_down() throws Exception {
        assertThat(api.post("/api/presence/bye", null).statusCode()).isEqualTo(200);
        waitFor(() -> shutdowns.get() == 1, 3000);
        assertThat(shutdowns.get()).isEqualTo(1);
    }

    @Test
    void c05_a_window_that_reconnects_cancels_the_shutdown() throws Exception {
        presence.bye();
        presence.connected();
        Thread.sleep(600);
        assertThat(shutdowns.get()).isZero();
    }

    @Test
    void c05_without_goodbye_it_stays_alive_unless_auto_shutdown_is_set() throws Exception {
        presence.connected();
        presence.disconnected();
        Thread.sleep(500);
        assertThat(shutdowns.get()).isZero();

        AtomicInteger auto = new AtomicInteger();
        try (Presence withAuto = new Presence(auto::incrementAndGet, Duration.ofSeconds(15), () -> Duration.ofMillis(200))) {
            withAuto.connected();
            withAuto.disconnected();
            waitFor(() -> auto.get() == 1, 3000);
            assertThat(auto.get()).isEqualTo(1);
        }
    }

    @Test
    void c06_shutdown_answers_before_stopping() throws Exception {
        HttpResponse<String> r = api.post("/api/shutdown", null);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains("\"stopping\":true");
        waitFor(() -> shutdowns.get() == 1, 3000);
        assertThat(shutdowns.get()).isEqualTo(1);
    }

    @Test
    void c06_s20_instance_file_keeps_port_and_token_privately() throws Exception {
        Path file = dir.resolve("state/instance.json");
        InstanceFile instance = new InstanceFile(file);
        assertThat(instance.read()).isEmpty();
        instance.write(47800, "token-de-prueba");
        assertThat(instance.read()).contains(new InstanceFile.Instance(47800, "token-de-prueba"));
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }
        instance.delete();
        assertThat(Files.exists(file)).isFalse();
        Files.writeString(file, "roto");
        assertThat(instance.read()).isEmpty();
    }

    @Test
    void s20_private_files_have_600_permissions_on_posix() throws Exception {
        assumeTrue(dir.getFileSystem().supportedFileAttributeViews().contains("posix"), "Solo en POSIX (ADR-0004)");
        Path file = dir.resolve("apps/tasks/secret.json");
        dev.cajonsastre.platform.PrivateFile.writeJson(file, new com.fasterxml.jackson.databind.ObjectMapper(), List.of("x"));
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
    }

    @Test
    void c07_parses_the_command_line() {
        assertThat(CommandLine.parse(new String[0])).isEqualTo(new CommandLine.Options(false, null, false));
        assertThat(CommandLine.parse(new String[]{"--no-window", "--port", "47900"}))
                .isEqualTo(new CommandLine.Options(true, 47900, false));
        assertThat(CommandLine.parse(new String[]{"--stop"}).stop()).isTrue();
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port"})).hasMessageContaining("Falta el número");
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port", "x"})).hasMessageContaining("Puerto no válido");
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port", "0"})).hasMessageContaining("Puerto no válido");
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--port", "65536"})).hasMessageContaining("Puerto no válido");
        assertThatThrownBy(() -> CommandLine.parse(new String[]{"--open", "x"})).hasMessageContaining("Opción desconocida");
        assertThat(CommandLine.USAGE).startsWith("Uso: cajonsastre");
    }

    @Test
    void c03_c08_the_window_has_its_own_class_and_chrome_profile() {
        Path profile = dir.resolve("state/chrome");
        assertThat(Desktop.chromeCommand("http://127.0.0.1:47800/", profile)).containsExactly("google-chrome",
                "--app=http://127.0.0.1:47800/", "--class=cajonsastre", "--user-data-dir=" + profile,
                "--ozone-platform=x11", "--no-first-run", "--no-default-browser-check");
        assertThat(Desktop.WINDOW_CLASS).isNotEqualTo("litedd");
    }

    private static void waitFor(java.util.function.BooleanSupplier condition, long millis) throws InterruptedException {
        long deadline = System.currentTimeMillis() + millis;
        while (!condition.getAsBoolean() && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }
}
