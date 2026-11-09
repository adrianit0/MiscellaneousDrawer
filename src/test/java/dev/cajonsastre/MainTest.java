package dev.cajonsastre;

import dev.cajonsastre.http.HttpServer;
import io.javalin.Javalin;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Arranque y convivencia con LiteDD: C-01, C-08, C-09, S-12, D-04. */
class MainTest {

    @Test
    void c01_only_the_own_signature_counts_as_a_running_instance() {
        assertThat(Main.isOwnHealth(200, "{\"app\":\"CajonSastre\",\"version\":\"0.1.0\",\"build\":0}")).isTrue();
        assertThat(Main.isOwnHealth(200, "{\"app\":\"LiteDD\",\"version\":\"0.1.0\",\"build\":7}")).isFalse();
        assertThat(Main.isOwnHealth(403, "{\"app\":\"CajonSastre\"}")).isFalse();
        assertThat(Main.isOwnHealth(200, null)).isFalse();
    }

    @Test
    void c01_detects_its_own_server_and_ignores_another_app_on_the_port() {
        int port = TestApi.freePort();
        HttpServer own = new HttpServer(port, TestApi.TOKEN).start();
        try {
            assertThat(Main.isRunning(port)).isTrue();
        } finally {
            own.stop();
        }
        assertThat(Main.isRunning(port)).isFalse();

        int other = TestApi.freePort();
        Javalin liteLike = Javalin.create(c -> {
            c.jetty.host = HttpServer.HOST;
            c.jetty.port = other;
            c.startup.showJavalinBanner = false;
            c.routes.get("/api/health", ctx -> ctx.json(Map.of("app", "LiteDD", "version", "0.1.0")));
        }).start();
        try {
            assertThat(Main.isRunning(other)).isFalse();
        } finally {
            liteLike.stop();
        }
    }

    @Test
    void s12_the_session_token_is_random_and_long() {
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            tokens.add(Main.sessionToken());
        }
        assertThat(tokens).doesNotHaveDuplicates().allSatisfy(t -> assertThat(t).hasSizeGreaterThanOrEqualTo(43));
        assertThat(Main.DEV_TOKEN_ENV).isEqualTo("CAJONSASTRE_DEV_TOKEN");
    }

    @Test
    void c08_folders_are_named_cajonsastre_and_respect_xdg() {
        assertThat(DataPaths.resolve("/xdg/data", "/home/usuario", ".local", "share")).isEqualTo(Path.of("/xdg/data", "cajonsastre"));
        assertThat(DataPaths.resolve(null, "/home/usuario", ".local", "share"))
                .isEqualTo(Path.of("/home/usuario", ".local", "share", "cajonsastre"));
        assertThat(DataPaths.resolve(" ", "/home/usuario", ".config")).isEqualTo(Path.of("/home/usuario", ".config", "cajonsastre"));
        assertThat(DataPaths.dataDir().getFileName().toString()).isEqualTo("cajonsastre");
        assertThat(DataPaths.configDir().getFileName().toString()).isEqualTo("cajonsastre");
        assertThat(DataPaths.stateDir().getFileName().toString()).isEqualTo("cajonsastre");
        assertThat(DataPaths.shellDatabase().getFileName().toString()).isEqualTo("cajonsastre.db");
        assertThat(DataPaths.chromeProfile()).isEqualTo(DataPaths.stateDir().resolve("chrome"));
        assertThat(DataPaths.appPaths().database("tasks")).isEqualTo(DataPaths.dataDir().resolve("apps/tasks/data.db"));
    }

    @Test
    void c09_the_log_goes_to_the_state_folder() {
        assertThat(DataPaths.logFile()).isEqualTo(DataPaths.stateDir().resolve("cajonsastre.log"));
    }

    @Test
    void d04_the_shell_database_has_the_setting_and_app_state_tables(@TempDir Path dir) {
        try (var store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"))) {
            List<String> tables = store.read(s -> {
                List<String> names = new ArrayList<>();
                // La conexión es del Store: solo se cierra el resultado.
                Connection c = s.getConnection();
                try (ResultSet rs = c.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
                    while (rs.next()) {
                        names.add(rs.getString("TABLE_NAME"));
                    }
                } catch (java.sql.SQLException e) {
                    throw new IllegalStateException(e);
                }
                return names;
            });
            assertThat(tables).containsExactlyInAnyOrder("setting", "app_state");
        }
    }
}
