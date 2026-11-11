package dev.cajonsastre.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppRegistry.Status;
import dev.cajonsastre.platform.MiniApp;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Arranque aislado, rutas y datos de las mini apps (P-04 a P-10), con el servidor real. */
class AppRegistryTest {

    @TempDir
    Path dir;
    List<String> stopped = new CopyOnWriteArrayList<>();
    FixtureApps.Notes notes;
    AppPaths paths;
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        notes = new FixtureApps.Notes("fixture-notes", stopped);
        paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        AppCatalog catalog = new AppCatalog(List.of(
                notes,
                FixtureApps.throwing(),
                new FixtureApps.Echo(stopped),
                FixtureApps.brokenMigration(),
                FixtureApps.badRoute(),
                FixtureApps.foreignMigrations(),
                MiniApp.of(FixtureApps.manifest("fixture-ui", false)),
                MiniApp.of(FixtureApps.manifest("fixture-planned", true))));
        registry = AppRegistry.start(catalog, paths, Clock.systemUTC());
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
    }

    @Test
    void p04_catalog_reports_the_status_of_every_app_in_catalog_order() {
        HttpResponse<String> r = api.get("/api/catalog");
        assertThat(r.statusCode()).isEqualTo(200);
        JsonNode apps = TestApi.json(r).get("apps");
        assertThat(apps).extracting(a -> a.get("id").asText()).containsExactly("fixture-notes", "fixture-throws",
                "fixture-echo", "fixture-broken", "fixture-bad-route", "fixture-foreign", "fixture-ui", "fixture-planned");
        assertThat(apps).extracting(a -> a.get("status").asText()).containsExactly("available", "failed", "available",
                "failed", "failed", "failed", "available", "planned");
        JsonNode first = apps.get(0);
        assertThat(first.get("name").asText()).isEqualTo("Prueba fixture-notes");
        assertThat(first.get("description").asText()).isEqualTo("Mini app de prueba");
        assertThat(first.get("icon").asText()).isEqualTo("app");
        assertThat(first.get("color").asText()).isEqualTo("blue");
        assertThat(first.get("category").asText()).isEqualTo("utilities");
        assertThat(first.get("keywords")).extracting(JsonNode::asText).containsExactly("prueba");
        assertThat(first.get("error").isNull()).isTrue();
        assertThat(apps.get(1).get("error").asText()).isEqualTo("Falta la configuración de prueba");
    }

    @Test
    void p05_p06_an_available_app_serves_its_routes_with_its_own_database() {
        assertThat(api.post("/api/apps/fixture-notes/items", "{\"title\":\"Primera\"}").statusCode()).isEqualTo(201);
        api.post("/api/apps/fixture-notes/items", "{\"title\":\"Segunda\"}");
        HttpResponse<String> r = api.get("/api/apps/fixture-notes/items");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(TestApi.json(r)).extracting(JsonNode::asText).containsExactly("Primera", "Segunda");
        assertThat(TestApi.json(api.get("/api/apps/fixture-echo/hello")).get("app").asText()).isEqualTo("fixture-echo");
    }

    @Test
    void p07_a_failed_app_answers_503_and_the_rest_keep_working() {
        for (String path : List.of("/api/apps/fixture-throws/never", "/api/apps/fixture-throws",
                "/api/apps/fixture-broken/anything/else")) {
            HttpResponse<String> r = api.get(path);
            assertThat(r.statusCode()).as(path).isEqualTo(503);
            assertThat(TestApi.json(r).get("code").asText()).isEqualTo("app_unavailable");
        }
        assertThat(TestApi.json(api.get("/api/apps/fixture-throws/never")).get("details").get("appId").asText())
                .isEqualTo("fixture-throws");
        assertThat(api.get("/api/apps/fixture-notes/items").statusCode()).isEqualTo(200);
        assertThat(api.get("/api/catalog").statusCode()).isEqualTo(200);
    }

    @Test
    void p07_d02_a_failing_migration_leaves_the_app_failed_with_the_reason() {
        AppRegistry.Entry broken = registry.find("fixture-broken").orElseThrow();
        assertThat(broken.status()).isEqualTo(Status.FAILED);
        assertThat(broken.error()).contains("Falló la migración db/apps/fixture-broken/V001__initial.sql");
        assertThat(broken.store()).isNull();
        // La transacción de la migración se deshizo: la base queda sin esquema.
        assertThat(Files.exists(paths.database("fixture-broken"))).isTrue();
    }

    @Test
    void p06_s16_a_route_outside_the_namespace_fails_the_app_and_is_not_published() {
        AppRegistry.Entry bad = registry.find("fixture-bad-route").orElseThrow();
        assertThat(bad.status()).isEqualTo(Status.FAILED);
        assertThat(bad.error()).contains("Ruta no válida");
        assertThat(api.get("/api/catalog").statusCode()).isEqualTo(200);
        assertThat(registry.find("fixture-throws").orElseThrow().routes()).isEmpty();
    }

    @Test
    void p08_each_app_has_its_own_database_and_cannot_use_another_apps_migrations() {
        assertThat(paths.database("fixture-notes")).isEqualTo(dir.resolve("data/apps/fixture-notes/data.db"));
        assertThat(Files.exists(paths.database("fixture-notes"))).isTrue();
        // Sin migraciones no hay base, y pedirla es un error de la mini app.
        assertThat(Files.exists(paths.database("fixture-echo"))).isFalse();
        HttpResponse<String> noStore = api.get("/api/apps/fixture-echo/store");
        assertThat(noStore.statusCode()).isEqualTo(500);

        AppRegistry.Entry foreign = registry.find("fixture-foreign").orElseThrow();
        assertThat(foreign.status()).isEqualTo(Status.FAILED);
        assertThat(foreign.error()).contains("no está en db/apps/fixture-foreign/");
        assertThat(Files.exists(paths.database("fixture-foreign"))).isFalse();
    }

    @Test
    void p09_the_context_gives_and_creates_the_app_folders() {
        assertThat(notes.context.dataDir()).isEqualTo(dir.resolve("data/apps/fixture-notes"));
        assertThat(notes.context.configDir()).isEqualTo(dir.resolve("config/apps/fixture-notes"));
        JsonNode dirs = TestApi.json(api.get("/api/apps/fixture-notes/dirs"));
        assertThat(dirs.get("data").asBoolean()).isTrue();
        assertThat(dirs.get("config").asBoolean()).isTrue();
        assertThat(notes.context.appId()).isEqualTo("fixture-notes");
    }

    @Test
    void p11_a_frontend_only_app_is_available_without_server_side() {
        AppRegistry.Entry ui = registry.find("fixture-ui").orElseThrow();
        assertThat(ui.status()).isEqualTo(Status.AVAILABLE);
        assertThat(ui.routes()).isEmpty();
        assertThat(ui.store()).isNull();
        assertThat(api.get("/api/apps/fixture-ui/anything").statusCode()).isEqualTo(404);
        assertThat(registry.find("fixture-planned").orElseThrow().status()).isEqualTo(Status.PLANNED);
        assertThat(api.get("/api/apps/fixture-planned/anything").statusCode()).isEqualTo(404);
    }

    @Test
    void s12_app_routes_require_the_session_token() throws Exception {
        HttpResponse<String> r = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + api.port() + "/api/apps/fixture-notes/items")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(403);
    }

    @Test
    void p10_stops_apps_in_reverse_order_even_if_one_fails_and_closes_their_databases() {
        registry.close();
        assertThat(stopped).containsExactly("fixture-echo", "fixture-notes");
        assertThatThrownBy(() -> notes.context.store().read(s -> s.getMapper(FixtureApps.ItemMapper.class).titles()))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void p20_reports_the_first_busy_app_with_its_name_and_reason() {
        FixtureApps.Worker first = new FixtureApps.Worker("fixture-first");
        FixtureApps.Worker second = new FixtureApps.Worker("fixture-second");
        AppPaths other = new AppPaths(dir.resolve("busy"), dir.resolve("busy-config"), dir.resolve("busy/backups"));
        AppRegistry r = AppRegistry.start(new AppCatalog(List.of(first, FixtureApps.throwing(),
                MiniApp.of(FixtureApps.manifest("fixture-planned", true)), second)), other, Clock.systemUTC());
        try {
            assertThat(r.busy()).isNull();
            second.reason = "hay un trabajo en marcha";
            assertThat(r.busy()).isEqualTo("«Prueba fixture-second» está ocupada: hay un trabajo en marcha");
            first.reason = "copiando";
            assertThat(r.busy()).isEqualTo("«Prueba fixture-first» está ocupada: copiando");
            // Un fallo al preguntar cuenta como no ocupada y no impide preguntar a las demás.
            first.fail = true;
            assertThat(r.busy()).startsWith("«Prueba fixture-second»");
            second.reason = null;
            assertThat(r.busy()).isNull();
        } finally {
            r.close();
        }
        second.reason = "sigue";
        assertThat(r.busy()).as("apagada").isNull();
    }

    @Test
    void p08_two_apps_never_share_a_database() {
        List<String> stops = new CopyOnWriteArrayList<>();
        FixtureApps.Notes a = new FixtureApps.Notes("fixture-notes", stops);
        AppPaths other = new AppPaths(dir.resolve("other"), dir.resolve("other-config"), dir.resolve("other/backups"));
        try (AppRegistry r = AppRegistry.start(new AppCatalog(List.of(a)), other, Clock.systemUTC())) {
            a.context.store().write(s -> {
                s.getMapper(FixtureApps.ItemMapper.class).insert("solo en other");
                return null;
            });
            assertThat(notes.context.store().<List<String>>read(s -> s.getMapper(FixtureApps.ItemMapper.class).titles()))
                    .doesNotContain("solo en other");
            assertThat(r.entries()).hasSize(1);
        }
    }
}
