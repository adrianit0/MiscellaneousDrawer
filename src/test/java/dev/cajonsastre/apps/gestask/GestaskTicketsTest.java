package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.messages.MessageCenter;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/** GT-121: los tickets de las tareas pasan a «Tableros Jira» sin cambiar la respuesta (ADR-0030). Datos inventados. */
class GestaskTicketsTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/gestask";
    private static final AppManifest JIRA = new AppManifest("jira", "Tableros Jira", "Prueba", "app",
            AppColor.CYAN, AppCategory.PRODUCTIVITY, List.of(), false);

    @TempDir
    Path dir;
    final FakeSupabase supabase = new FakeSupabase();
    final AtomicBoolean broken = new AtomicBoolean();
    Store shell;
    MessageCenter center;
    AppRegistry registry;
    TestApi api;
    volatile String tasks = "{\"tasks\":[]}";

    @BeforeEach
    void start() {
        shell = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(shell, Clock.systemUTC(), id -> true);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        supabase.answer = r -> new Transport.Reply(200, r.function().equals("tasks-list") ? tasks : "{\"ok\":true}");
        registry = AppRegistry.start(new AppCatalog(List.of(new GestaskApp(supabase))), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> { }, manifest -> name -> null, manifest -> failing(center.forApp(manifest)));
        api = TestApi.start(List.of(registry));
        String config = JSON.createObjectNode().put("supabaseUrl", "https://proyecto-de-prueba.supabase.example")
                .put("publishableKey", "clave-de-prueba").put("email", "persona@example.test")
                .put("password", "clave-secreta-de-prueba").toString();
        assertThat(api.put(BASE + "/config", config).statusCode()).isEqualTo(200);
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
        shell.close();
    }

    /** Un buzón que falla al enviar mientras broken sea true. */
    private Messages failing(Messages real) {
        return new Messages() {
            @Override
            public void send(String recipient, String type, String content) {
                if (broken.get()) {
                    throw new IllegalStateException("Base del shell no disponible");
                }
                real.send(recipient, type, content);
            }

            @Override
            public List<Message> pending() {
                return real.pending();
            }

            @Override
            public void ack(long id) {
                real.ack(id);
            }
        };
    }

    private static String task(String ticket) {
        return "{\"id\":\"t-" + Math.abs(String.valueOf(ticket).hashCode()) + "\",\"title\":\"Tarea\",\"ticket\":"
                + (ticket == null ? "null" : "\"" + ticket + "\"") + "}";
    }

    private HttpResponse<String> loadTasks(String... list) {
        tasks = "{\"tasks\":[" + String.join(",", list) + "]}";
        return api.get(BASE + "/fn/tasks-list?sort_by=created_at&sort_direction=desc");
    }

    private List<String> received() {
        return center.forApp(JIRA).pending().stream()
                .peek(m -> assertThat(m.sender()).isEqualTo("gestask"))
                .peek(m -> assertThat(m.type()).isEqualTo("gestask-tickets"))
                .map(Message::content).toList();
    }

    @Test
    void gt121_sends_the_tickets_of_the_main_list_and_leaves_the_response_unchanged() {
        HttpResponse<String> r = loadTasks(task("PROJ-12"), task(" PROJ-3 "), task(null), task(""), task("  "),
                task("PROJ-12"), task("GT-0007"));

        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).isEqualTo(tasks);
        // Sin espacios, sin vacíos, sin repetir y en orden.
        assertThat(received()).containsExactly("{\"tickets\":[\"GT-0007\",\"PROJ-12\",\"PROJ-3\"]}");
    }

    @Test
    void gt121_only_sends_again_when_the_list_changes() {
        loadTasks(task("PROJ-1"), task("PROJ-2"));
        loadTasks(task("PROJ-2"), task("PROJ-1"));
        loadTasks(task("PROJ-1"));
        loadTasks();

        assertThat(received()).containsExactly("{\"tickets\":[\"PROJ-1\",\"PROJ-2\"]}", "{\"tickets\":[\"PROJ-1\"]}",
                "{\"tickets\":[]}");
    }

    @Test
    void gt121_the_daily_list_and_other_functions_send_nothing() {
        tasks = "{\"tasks\":[" + task("PROJ-1") + "]}";
        api.get(BASE + "/fn/tasks-list?ticket_type=Diaria&sort_by=created_at&sort_direction=asc");
        api.get(BASE + "/fn/tasks-order-list");
        api.get(BASE + "/fn/tasks-completion-list");

        assertThat(received()).isEmpty();
    }

    @Test
    void gt121_a_failure_reading_or_sending_does_not_reach_the_interface() {
        tasks = "{\"tasks\":\"no es una lista\"}";
        HttpResponse<String> unreadable = api.get(BASE + "/fn/tasks-list");
        assertThat(unreadable.statusCode()).isEqualTo(200);
        assertThat(unreadable.body()).isEqualTo(tasks);

        broken.set(true);
        HttpResponse<String> unsent = loadTasks(task("PROJ-1"));
        assertThat(unsent.statusCode()).isEqualTo(200);
        assertThat(unsent.body()).isEqualTo(tasks);
        assertThat(received()).isEmpty();

        // Lo que no se pudo enviar se envía la próxima vez.
        broken.set(false);
        loadTasks(task("PROJ-1"));
        assertThat(received()).containsExactly("{\"tickets\":[\"PROJ-1\"]}");
    }

    @Test
    void gt121_a_list_that_does_not_fit_in_a_message_is_not_sent() {
        String many = IntStream.range(0, 6000).mapToObj(i -> task("PROYECTO-" + i)).collect(Collectors.joining(","));
        HttpResponse<String> r = loadTasks(many);

        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(received()).isEmpty();
    }
}
