package dev.cajonsastre.notifications;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import dev.cajonsastre.platform.Store;
import dev.cajonsastre.settings.AppConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Notificaciones de la plataforma: P-21 a P-24 (ADR-0013). */
class NotificationCenterTest {

    private static final AppManifest NOTES = manifest("notes", "Notas");
    private static final AppManifest TASKS = manifest("tasks", "Tareas");

    @TempDir
    Path dir;
    Store store;
    final Set<String> known = new java.util.HashSet<>(Set.of("notes", "tasks"));
    final List<List<String>> launched = new CopyOnWriteArrayList<>();
    volatile AppConfig config = AppConfig.DEFAULT;
    NotificationCenter center;
    TestApi api;

    private static AppManifest manifest(String id, String name) {
        return new AppManifest(id, name, "Mini app de prueba", "app", AppColor.BLUE, AppCategory.UTILITIES, List.of(), false);
    }

    @BeforeEach
    void start() {
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = center(store);
        api = TestApi.start(List.of(center));
    }

    private NotificationCenter center(Store store) {
        Clock clock = Clock.fixed(Instant.parse("2026-11-12T09:30:15.250Z"), ZoneOffset.UTC);
        return new NotificationCenter(store, clock, known::contains, new DesktopAnnouncer(() -> config, launched::add));
    }

    @AfterEach
    void stop() {
        api.close();
        store.close();
    }

    private JsonNode listed() {
        return TestApi.json(api.get("/api/notifications")).get("notifications");
    }

    @Test
    void p21_p22_a_notification_is_saved_with_its_app_and_its_date() {
        center.forApp(NOTES).send("  Exportación terminada  ", " 3 notas ", NotificationKind.SUCCESS, "/exports/42");
        center.forApp(TASKS).send("Ha fallado la sincronización", NotificationKind.ERROR);

        JsonNode all = listed();
        assertThat(all).hasSize(2);
        // P-22: la más reciente primero.
        JsonNode failed = all.get(0);
        assertThat(failed.get("appId").asText()).isEqualTo("tasks");
        assertThat(failed.get("kind").asText()).isEqualTo("error");
        assertThat(failed.get("title").asText()).isEqualTo("Ha fallado la sincronización");
        assertThat(failed.get("text").isNull()).isTrue();
        assertThat(failed.get("path").isNull()).isTrue();
        JsonNode exported = all.get(1);
        assertThat(exported.get("id").asLong()).isLessThan(failed.get("id").asLong());
        assertThat(exported.get("appId").asText()).isEqualTo("notes");
        assertThat(exported.get("kind").asText()).isEqualTo("success");
        assertThat(exported.get("title").asText()).isEqualTo("Exportación terminada");
        assertThat(exported.get("text").asText()).isEqualTo("3 notas");
        assertThat(exported.get("path").asText()).isEqualTo("/exports/42");
        assertThat(exported.get("createdAt").asText()).isEqualTo("2026-11-12T09:30:15Z");
    }

    @Test
    void p21_a_value_out_of_format_is_a_programming_error_and_saves_nothing() {
        Notifications notes = center.forApp(NOTES);
        assertThatThrownBy(() -> notes.send(" ", NotificationKind.INFO)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("título");
        assertThatThrownBy(() -> notes.send(null, NotificationKind.INFO)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> notes.send("x".repeat(81), NotificationKind.INFO)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> notes.send("Título", "x".repeat(301), NotificationKind.INFO, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("texto");
        assertThatThrownBy(() -> notes.send("Título", null, null, null)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tipo");
        for (String path : List.of("exports", "/../tasks", "/a?b=1", "/a#b", "/a b")) {
            assertThatThrownBy(() -> notes.send("Título", null, NotificationKind.INFO, path)).as(path)
                    .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Subruta");
        }
        notes.send("x".repeat(80), "y".repeat(300), NotificationKind.INFO, "/");
        assertThat(listed()).hasSize(1);
        assertThat(launched).hasSize(2);
    }

    @Test
    void p21_a_failure_of_the_shell_does_not_reach_the_mini_app() {
        Notifications notes = center.forApp(NOTES);
        center.onNotification(n -> {
            throw new IllegalStateException("la ventana se ha ido");
        });
        assertThatCode(() -> notes.send("Con una ventana rota", NotificationKind.INFO)).doesNotThrowAnyException();
        assertThat(listed()).hasSize(1);

        // Con la base cerrada, como en un apagado.
        try (Store closed = ShellDatabase.open(dir.resolve("otra.db"), dir.resolve("backups"))) {
            NotificationCenter broken = center(closed);
            closed.close();
            assertThatCode(() -> broken.forApp(NOTES).send("Sin base", NotificationKind.INFO)).doesNotThrowAnyException();
        }
    }

    @Test
    void p21_each_mini_app_gets_in_its_context_the_notifications_of_its_own_identity(@TempDir Path apps) {
        List<AppContext> contexts = new ArrayList<>();
        MiniApp tasks = new MiniApp() {
            @Override
            public AppManifest manifest() {
                return TASKS;
            }

            @Override
            public void start(AppContext context, AppRoutes routes) {
                contexts.add(context);
            }
        };
        AppPaths paths = new AppPaths(apps.resolve("data"), apps.resolve("config"), apps.resolve("backups"));
        try (AppRegistry registry = AppRegistry.start(new AppCatalog(List.of(tasks)), paths, Clock.systemUTC(), center::forApp)) {
            assertThat(registry.entries()).hasSize(1);
            contexts.get(0).notifications().send("Tarea vencida", NotificationKind.INFO);
        }
        assertThat(listed().get(0).get("appId").asText()).isEqualTo("tasks");
        assertThat(launched.get(0)).containsExactly("notify-send", "Tareas", "Tarea vencida");
    }

    @Test
    void p22_only_the_last_50_are_kept_and_they_survive_a_restart() {
        Notifications notes = center.forApp(NOTES);
        for (int i = 1; i <= NotificationCenter.KEEP + 5; i++) {
            notes.send("Notificación " + i, NotificationKind.INFO);
        }
        JsonNode all = listed();
        assertThat(all).hasSize(50);
        assertThat(all.get(0).get("title").asText()).isEqualTo("Notificación 55");
        assertThat(all.get(49).get("title").asText()).isEqualTo("Notificación 6");

        store.close();
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        assertThat(center(store).list()).hasSize(50).first()
                .satisfies(n -> assertThat(n.title()).isEqualTo("Notificación 55"));
    }

    @Test
    void p22_clearing_deletes_them_all_and_the_identifiers_are_not_reused() {
        Notifications notes = center.forApp(NOTES);
        notes.send("Una", NotificationKind.INFO);
        notes.send("Dos", NotificationKind.INFO);
        long last = listed().get(0).get("id").asLong();

        var cleared = api.send("DELETE", "/api/notifications", null);
        assertThat(cleared.statusCode()).isEqualTo(200);
        assertThat(TestApi.json(cleared).get("notifications")).isEmpty();
        assertThat(listed()).isEmpty();

        // N-12: una notificación posterior sigue siendo más nueva que la última vista.
        notes.send("Tres", NotificationKind.INFO);
        assertThat(listed().get(0).get("id").asLong()).isGreaterThan(last);
    }

    @Test
    void p22_the_notifications_of_an_app_that_left_the_catalog_are_not_returned() {
        center.forApp(NOTES).send("De notas", NotificationKind.INFO);
        center.forApp(TASKS).send("De tareas", NotificationKind.INFO);
        known.remove("notes");
        assertThat(listed()).extracting(n -> n.get("title").asText()).containsExactly("De tareas");
    }

    @Test
    void p23_each_new_notification_reaches_who_is_listening_already_saved() {
        List<NotificationCenter.Notification> received = new ArrayList<>();
        center.onNotification(received::add);
        center.forApp(NOTES).send("Copia terminada", "2 ficheros", NotificationKind.SUCCESS, "/");
        assertThat(received).hasSize(1);
        NotificationCenter.Notification n = received.get(0);
        assertThat(n.id()).isEqualTo(listed().get(0).get("id").asLong());
        assertThat(n).isEqualTo(new NotificationCenter.Notification(n.id(), "notes", "success", "Copia terminada",
                "2 ficheros", "/", "2026-11-12T09:30:15Z"));
    }

    @Test
    void p24_announces_on_the_desktop_and_plays_the_sound_according_to_the_settings() {
        Notifications notes = center.forApp(NOTES);
        notes.send("Copia terminada", "2 ficheros", NotificationKind.SUCCESS, null);
        assertThat(launched).containsExactly(List.of("notify-send", "Notas", "Copia terminada"),
                List.of("paplay", "/usr/share/sounds/freedesktop/stereo/complete.oga"));

        launched.clear();
        config = new AppConfig(47800, null, null, false, true);
        notes.send("Sin sonido", NotificationKind.INFO);
        assertThat(launched).containsExactly(List.of("notify-send", "Notas", "Sin sonido"));

        launched.clear();
        config = new AppConfig(47800, null, null, true, false);
        notes.send("Sin escritorio", NotificationKind.INFO);
        assertThat(launched).containsExactly(List.of("paplay", DesktopAnnouncer.SOUND));

        launched.clear();
        config = new AppConfig(47800, null, null, false, false);
        notes.send("En silencio", NotificationKind.INFO);
        assertThat(launched).isEmpty();
        assertThat(listed()).hasSize(4);
    }

    @Test
    void p24_commands_that_do_not_exist_or_fail_change_nothing() {
        DesktopAnnouncer failing = new DesktopAnnouncer(() -> AppConfig.DEFAULT, command -> {
            launched.add(command);
            throw new java.io.UncheckedIOException(new java.io.IOException("No existe " + command.get(0)));
        });
        NotificationCenter quiet = new NotificationCenter(store, Clock.systemUTC(), known::contains, failing);
        assertThatCode(() -> quiet.forApp(NOTES).send("Sin comandos", NotificationKind.INFO)).doesNotThrowAnyException();
        // Un fallo de notify-send no impide intentar el sonido.
        assertThat(launched).extracting(c -> c.get(0)).containsExactly("notify-send", "paplay");
        assertThat(listed()).hasSize(1);

        // El lanzador real falla así con un comando que no existe.
        assertThatThrownBy(() -> DesktopAnnouncer.launch(List.of("cajonsastre-comando-que-no-existe")))
                .isInstanceOf(java.io.UncheckedIOException.class);
    }
}
