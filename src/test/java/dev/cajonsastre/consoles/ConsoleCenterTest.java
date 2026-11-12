package dev.cajonsastre.consoles;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.Console;
import dev.cajonsastre.platform.ConsoleState;
import dev.cajonsastre.platform.Consoles;
import dev.cajonsastre.platform.MiniApp;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Consolas de la plataforma: P-25 a P-28 (ADR-0014). */
class ConsoleCenterTest {

    private static final AppManifest NOTES = manifest("notes", "Notas");
    private static final AppManifest TASKS = manifest("tasks", "Tareas");

    final Set<String> known = new HashSet<>(Set.of("notes", "tasks"));
    ConsoleCenter center;
    TestApi api;

    private static AppManifest manifest(String id, String name) {
        return new AppManifest(id, name, "Mini app de prueba", "app", AppColor.BLUE, AppCategory.UTILITIES, List.of(), false);
    }

    @BeforeEach
    void start() {
        center = new ConsoleCenter(Clock.fixed(Instant.parse("2026-11-12T09:30:15.250Z"), ZoneOffset.UTC), known::contains);
        api = TestApi.start(List.of(center));
    }

    @AfterEach
    void stop() {
        api.close();
    }

    private JsonNode listed() {
        return TestApi.json(api.get("/api/consoles")).get("consoles");
    }

    private JsonNode slice(long id, long after) {
        HttpResponse<String> r = api.get("/api/consoles/" + id + "?after=" + after);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private static List<String> lines(JsonNode slice) {
        List<String> out = new ArrayList<>();
        slice.get("lines").forEach(l -> out.add(l.asText()));
        return out;
    }

    @Test
    void p25_p27_a_console_is_opened_in_progress_with_its_app_and_its_date() {
        Console export = center.forApp(NOTES).open("  Exportación 1  ");
        Console sync = center.forApp(TASKS).open("Sincronización");

        JsonNode all = listed();
        assertThat(all).hasSize(2);
        // P-27: la más reciente primero.
        assertThat(all.get(0).get("id").asLong()).isEqualTo(sync.id());
        assertThat(all.get(0).get("appId").asText()).isEqualTo("tasks");
        JsonNode first = all.get(1);
        assertThat(first.get("id").asLong()).isEqualTo(export.id()).isLessThan(sync.id());
        assertThat(first.get("appId").asText()).isEqualTo("notes");
        assertThat(first.get("name").asText()).isEqualTo("Exportación 1");
        assertThat(first.get("state").asText()).isEqualTo("running");
        assertThat(first.get("startedAt").asText()).isEqualTo("2026-11-12T09:30:15Z");
        assertThat(first.get("finishedAt").isNull()).isTrue();
        // P-27: la lista no lleva las líneas.
        assertThat(first.has("lines")).isFalse();
    }

    @Test
    void p25_lines_are_added_in_order_and_a_text_with_line_breaks_is_several_lines() {
        Console console = center.forApp(NOTES).open("Exportación");
        console.line("$ comando");
        console.line("uno\ndos\r\ntres\n");
        console.line("");
        console.line(null);
        console.line("x".repeat(ConsoleCenter.MAX_CHARS + 500));

        JsonNode slice = slice(console.id(), 0);
        assertThat(slice.get("console").get("id").asLong()).isEqualTo(console.id());
        assertThat(slice.get("from").asLong()).isZero();
        assertThat(slice.get("next").asLong()).isEqualTo(6);
        List<String> lines = lines(slice);
        assertThat(lines.subList(0, 5)).containsExactly("$ comando", "uno", "dos", "tres", "");
        assertThat(ConsoleCenter.MAX_CHARS).isEqualTo(2000);
        assertThat(lines.get(5)).hasSize(ConsoleCenter.MAX_CHARS + 1).endsWith("…");
    }

    @Test
    void p25_finishing_sets_the_state_and_the_date_and_then_nothing_else_changes() {
        Consoles notes = center.forApp(NOTES);
        Console ok = notes.open("Bien");
        Console bad = notes.open("Mal");
        Console cancelled = notes.open("Cancelada");
        ok.line("hecho");
        ok.finish(ConsoleState.SUCCEEDED);
        bad.finish(ConsoleState.FAILED);
        cancelled.finish(ConsoleState.CANCELLED);

        assertThat(listed()).extracting(c -> c.get("name").asText() + ":" + c.get("state").asText())
                .containsExactly("Cancelada:cancelled", "Mal:failed", "Bien:succeeded");
        assertThat(listed().get(2).get("finishedAt").asText()).isEqualTo("2026-11-12T09:30:15Z");

        // Después de terminar, ni líneas ni otro estado.
        ok.line("tarde");
        ok.finish(ConsoleState.FAILED);
        JsonNode slice = slice(ok.id(), 0);
        assertThat(lines(slice)).containsExactly("hecho");
        assertThat(slice.get("console").get("state").asText()).isEqualTo("succeeded");
    }

    @Test
    void p25_a_value_out_of_format_is_a_programming_error_and_opens_nothing() {
        Consoles notes = center.forApp(NOTES);
        assertThatThrownBy(() -> notes.open(" ")).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("nombre");
        assertThatThrownBy(() -> notes.open(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> notes.open("x".repeat(ConsoleCenter.MAX_NAME + 1))).isInstanceOf(IllegalArgumentException.class);
        assertThat(listed()).isEmpty();

        Console console = notes.open("x".repeat(80));
        assertThatThrownBy(() -> console.finish(null)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("estado");
        assertThat(listed().get(0).get("state").asText()).isEqualTo("running");
    }

    @Test
    void p25_each_mini_app_gets_in_its_context_the_consoles_of_its_own_identity(@TempDir Path apps) {
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
        try (AppRegistry registry = AppRegistry.start(new AppCatalog(List.of(tasks)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> {
                }, center::forApp)) {
            assertThat(registry.entries()).hasSize(1);
            contexts.get(0).consoles().open("Tarea larga").line("en marcha");
        }
        assertThat(listed().get(0).get("appId").asText()).isEqualTo("tasks");
        assertThat(listed().get(0).get("name").asText()).isEqualTo("Tarea larga");
    }

    @Test
    void p26_only_the_last_lines_are_kept_and_their_index_does_not_change() {
        Console console = center.forApp(NOTES).open("Larga");
        for (int i = 0; i < ConsoleCenter.MAX_LINES + 10; i++) {
            console.line("línea " + i);
        }
        assertThat(ConsoleCenter.MAX_LINES).isEqualTo(5000);
        JsonNode all = slice(console.id(), 0);
        assertThat(all.get("lines")).hasSize(ConsoleCenter.MAX_LINES);
        assertThat(all.get("from").asLong()).isEqualTo(10);
        assertThat(all.get("next").asLong()).isEqualTo(ConsoleCenter.MAX_LINES + 10);
        assertThat(all.get("lines").get(0).asText()).isEqualTo("línea 10");

        // P-27: solo las de índice mayor o igual que after.
        long next = all.get("next").asLong();
        JsonNode tail = slice(console.id(), next - 2);
        assertThat(tail.get("from").asLong()).isEqualTo(next - 2);
        assertThat(lines(tail)).containsExactly("línea 5008", "línea 5009");
        assertThat(slice(console.id(), next).get("lines")).isEmpty();
        assertThat(slice(console.id(), next + 50).get("from").asLong()).isEqualTo(next);
    }

    @Test
    void p26_only_20_consoles_are_kept_and_one_in_progress_is_never_discarded() {
        Consoles notes = center.forApp(NOTES);
        Console running = notes.open("En marcha");
        for (int i = 1; i <= ConsoleCenter.KEEP + 4; i++) {
            notes.open("Consola " + i).finish(ConsoleState.SUCCEEDED);
        }
        assertThat(ConsoleCenter.KEEP).isEqualTo(20);
        JsonNode all = listed();
        assertThat(all).hasSize(20);
        assertThat(all.get(0).get("name").asText()).isEqualTo("Consola 24");
        // Se descartó la terminada más antigua, no la que sigue en progreso.
        assertThat(all.get(18).get("name").asText()).isEqualTo("Consola 6");
        assertThat(all.get(19).get("id").asLong()).isEqualTo(running.id());
        assertThat(api.get("/api/consoles/" + (running.id() + 1)).statusCode()).isEqualTo(404);

        // Con todas en progreso no se descarta ninguna.
        ConsoleCenter busy = new ConsoleCenter(Clock.systemUTC(), id -> true);
        for (int i = 0; i < ConsoleCenter.KEEP + 2; i++) {
            busy.forApp(NOTES).open("Consola " + i);
        }
        assertThat(busy.list()).hasSize(22);
    }

    @Test
    void p26_s21_the_consoles_live_only_in_memory() {
        // ConsoleCenter no recibe ninguna base ni ninguna carpeta: no tiene dónde escribir.
        assertThat(ConsoleCenter.class.getConstructors()).hasSize(1);
        assertThat(ConsoleCenter.class.getConstructors()[0].getParameterTypes())
                .containsExactly(Clock.class, java.util.function.Predicate.class);
        // Otro centro, como tras un reinicio, empieza vacío.
        center.forApp(NOTES).open("Antes del reinicio").line("salida");
        assertThat(new ConsoleCenter(Clock.systemUTC(), known::contains).list()).isEmpty();
    }

    @Test
    void p27_the_consoles_of_an_app_that_left_the_catalog_are_not_returned() {
        center.forApp(NOTES).open("De notas");
        center.forApp(TASKS).open("De tareas");
        known.remove("notes");
        assertThat(listed()).extracting(c -> c.get("name").asText()).containsExactly("De tareas");
    }

    @Test
    void p27_a_console_that_does_not_exist_is_a_404_and_a_bad_index_a_400() {
        Console console = center.forApp(NOTES).open("Única");
        HttpResponse<String> missing = api.get("/api/consoles/999");
        assertThat(missing.statusCode()).isEqualTo(404);
        assertThat(TestApi.json(missing).get("code").asText()).isEqualTo("console_not_found");
        assertThat(api.get("/api/consoles/abc").statusCode()).isEqualTo(404);
        HttpResponse<String> bad = api.get("/api/consoles/" + console.id() + "?after=x");
        assertThat(bad.statusCode()).isEqualTo(400);
        assertThat(TestApi.json(bad).get("code").asText()).isEqualTo("invalid_request");
        // Sin after, desde el principio; un índice negativo, también.
        assertThat(TestApi.json(api.get("/api/consoles/" + console.id())).get("from").asLong()).isZero();
        assertThat(slice(console.id(), -5).get("from").asLong()).isZero();
    }

    @Test
    void p27_clearing_discards_the_finished_ones_and_keeps_those_in_progress() {
        Consoles notes = center.forApp(NOTES);
        Console running = notes.open("En marcha");
        notes.open("Terminada").finish(ConsoleState.SUCCEEDED);
        notes.open("Con error").finish(ConsoleState.FAILED);
        notes.open("Cancelada").finish(ConsoleState.CANCELLED);

        HttpResponse<String> cleared = api.send("DELETE", "/api/consoles", null);
        assertThat(cleared.statusCode()).isEqualTo(200);
        assertThat(TestApi.json(cleared).get("consoles")).extracting(c -> c.get("name").asText()).containsExactly("En marcha");
        assertThat(listed()).hasSize(1);

        // La que seguía en progreso sigue funcionando, y los identificadores no se reutilizan.
        running.line("sigue");
        assertThat(lines(slice(running.id(), 0))).containsExactly("sigue");
        assertThat(notes.open("Nueva").id()).isGreaterThan(running.id() + 3);
    }

    @Test
    void p28_each_change_in_the_list_reaches_who_is_listening_but_the_lines_do_not() {
        List<List<ConsoleCenter.View>> received = new ArrayList<>();
        center.onChange(received::add);
        Console console = center.forApp(NOTES).open("Copia");
        assertThat(received).hasSize(1);
        assertThat(received.get(0)).containsExactly(
                new ConsoleCenter.View(console.id(), "notes", "Copia", "running", "2026-11-12T09:30:15Z", null));

        console.line("una línea");
        assertThat(received).hasSize(1);

        console.finish(ConsoleState.FAILED);
        assertThat(received).hasSize(2);
        assertThat(received.get(1).get(0).state()).isEqualTo("failed");
        // Terminarla otra vez no cambia nada.
        console.finish(ConsoleState.SUCCEEDED);
        assertThat(received).hasSize(2);

        center.clear();
        assertThat(received).hasSize(3);
        assertThat(received.get(2)).isEmpty();
    }

    @Test
    void p28_a_failure_when_delivering_does_not_reach_the_mini_app() {
        center.onChange(list -> {
            throw new IllegalStateException("la ventana se ha ido");
        });
        Consoles notes = center.forApp(NOTES);
        assertThatCode(() -> notes.open("Con una ventana rota").finish(ConsoleState.SUCCEEDED)).doesNotThrowAnyException();
        assertThat(listed()).hasSize(1);
    }
}
