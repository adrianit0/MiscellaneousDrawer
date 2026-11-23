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

import static org.assertj.core.api.Assertions.assertThat;

/** GT-120: los PE cerrados del calendario pasan a «Lootboxes» sin cambiar la respuesta (ADR-0026). Datos inventados. */
class EffortPointsTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/gestask";
    private static final AppManifest LOOTBOXES = new AppManifest("lootboxes", "Lootboxes", "Prueba", "app",
            AppColor.ORANGE, AppCategory.LEISURE, List.of(), false);

    @TempDir
    Path dir;
    final FakeSupabase supabase = new FakeSupabase();
    final AtomicBoolean broken = new AtomicBoolean();
    Store shell;
    MessageCenter center;
    AppRegistry registry;
    TestApi api;
    volatile String month;

    @BeforeEach
    void start() {
        shell = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(shell, Clock.systemUTC(), id -> true);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        supabase.answer = r -> new Transport.Reply(200, r.function().equals("calendar-month-get") ? month : "{\"ok\":true}");
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

    private static String day(String date, String points) {
        return "{\"date\":\"" + date + "\",\"day\":1,\"status\":\"Laboral\",\"completed_points\":" + points + "}";
    }

    private HttpResponse<String> loadMonth(String... days) {
        month = "{\"days\":[" + String.join(",", days) + "]}";
        return api.get(BASE + "/fn/calendar-month-get?year=2026&month=1");
    }

    private List<String> received() {
        return center.forApp(LOOTBOXES).pending().stream()
                .peek(m -> assertThat(m.sender()).isEqualTo("gestask"))
                .peek(m -> assertThat(m.type()).isEqualTo("effort-points"))
                .map(Message::content).toList();
    }

    @Test
    void gt120_sends_the_closed_points_of_each_past_day_and_leaves_the_response_unchanged() {
        HttpResponse<String> r = loadMonth(day("2026-01-05", "5.5"), day("2026-01-06", "0"), day("2026-01-07", "null"),
                day("2999-01-08", "3"), day("2026-01-09", "12"));

        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).isEqualTo(month);
        // Sin los días a 0, sin valor o futuros.
        assertThat(received()).containsExactly("{\"date\":\"2026-01-05\",\"points\":5.5}",
                "{\"date\":\"2026-01-09\",\"points\":12}");
    }

    @Test
    void gt120_only_sends_a_day_again_when_its_value_changes() {
        loadMonth(day("2026-01-05", "2"));
        loadMonth(day("2026-01-05", "2.0"));
        loadMonth(day("2026-01-05", "4"));

        assertThat(received()).containsExactly("{\"date\":\"2026-01-05\",\"points\":2}",
                "{\"date\":\"2026-01-05\",\"points\":4}");
    }

    @Test
    void gt120_other_functions_send_nothing() {
        month = "{\"days\":[" + day("2026-01-05", "3") + "]}";
        api.get(BASE + "/fn/tasks-list");
        api.get(BASE + "/fn/daily-report-get?date=2026-01-05");

        assertThat(received()).isEmpty();
    }

    @Test
    void gt120_a_failure_reading_or_sending_does_not_reach_the_interface() {
        HttpResponse<String> unreadable = loadMonth("{\"date\":\"no es una fecha\",\"completed_points\":3}", "7");
        assertThat(unreadable.statusCode()).isEqualTo(200);
        assertThat(unreadable.body()).isEqualTo(month);

        broken.set(true);
        HttpResponse<String> unsent = loadMonth(day("2026-01-05", "3"));
        assertThat(unsent.statusCode()).isEqualTo(200);
        assertThat(received()).isEmpty();

        // Lo que no se pudo enviar se envía la próxima vez.
        broken.set(false);
        loadMonth(day("2026-01-05", "3"));
        assertThat(received()).containsExactly("{\"date\":\"2026-01-05\",\"points\":3}");
    }
}
