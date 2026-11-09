package dev.cajonsastre.catalog;

import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.platform.MiniApp;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** P-14, A-04, D-04: estado de interfaz de cada mini app en la base del shell. */
class AppStateApiTest {

    @TempDir
    Path dir;
    Store store;
    TestApi api;

    @BeforeEach
    void start() {
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        AppCatalog catalog = new AppCatalog(List.of(MiniApp.of(FixtureApps.manifest("tasks", false)),
                MiniApp.of(FixtureApps.manifest("database", true))));
        api = TestApi.start(List.of(new AppStateApi(store, catalog, Clock.systemUTC())));
    }

    @AfterEach
    void stop() {
        api.close();
        store.close();
    }

    @Test
    void p14_an_app_without_state_gets_an_empty_object() {
        HttpResponse<String> r = api.get("/api/app-state/tasks");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type")).hasValueSatisfying(v -> assertThat(v).startsWith("application/json"));
        assertThat(r.body()).isEqualTo("{}");
    }

    @Test
    void p14_saves_and_returns_the_state_document_of_each_app_separately() {
        assertThat(api.put("/api/app-state/tasks", "{\"filter\":\"pending\",\"widths\":[200,320]}").statusCode()).isEqualTo(200);
        api.put("/api/app-state/database", "{\"filter\":\"otro\"}");
        assertThat(TestApi.json(api.get("/api/app-state/tasks")).get("filter").asText()).isEqualTo("pending");
        assertThat(TestApi.json(api.get("/api/app-state/tasks")).get("widths").get(1).asInt()).isEqualTo(320);
        assertThat(TestApi.json(api.get("/api/app-state/database")).get("filter").asText()).isEqualTo("otro");
        // Sustituye el documento entero.
        api.put("/api/app-state/tasks", "{\"view\":\"board\"}");
        assertThat(TestApi.json(api.get("/api/app-state/tasks")).has("filter")).isFalse();
    }

    @Test
    void p14_rejects_documents_that_are_not_objects_or_exceed_64_kb() {
        for (String body : List.of("[1,2]", "\"texto\"", "42", "null")) {
            HttpResponse<String> r = api.put("/api/app-state/tasks", body);
            assertThat(r.statusCode()).as(body).isEqualTo(400);
            assertThat(TestApi.json(r).get("code").asText()).isEqualTo("invalid_state");
        }
        assertThat(api.put("/api/app-state/tasks", "{no es json").statusCode()).isEqualTo(400);
        String big = "{\"x\":\"" + "a".repeat(AppStateApi.MAX_BYTES) + "\"}";
        HttpResponse<String> tooBig = api.put("/api/app-state/tasks", big);
        assertThat(tooBig.statusCode()).isEqualTo(400);
        assertThat(TestApi.json(tooBig).get("message").asText()).contains("64 KB");
        String fits = "{\"x\":\"" + "a".repeat(AppStateApi.MAX_BYTES - 16) + "\"}";
        assertThat(api.put("/api/app-state/tasks", fits).statusCode()).isEqualTo(200);
    }

    @Test
    void a04_an_app_that_is_not_in_the_catalog_has_no_state() {
        HttpResponse<String> r = api.get("/api/app-state/notes");
        assertThat(r.statusCode()).isEqualTo(404);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo("app_not_found");
        assertThat(api.put("/api/app-state/notes", "{}").statusCode()).isEqualTo(404);
    }
}
