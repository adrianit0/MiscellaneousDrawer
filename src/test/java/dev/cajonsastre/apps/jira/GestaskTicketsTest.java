package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.messages.MessageCenter;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** JR-50: la lista de tickets de «Gestask» llega por el buzón y se guarda (ADR-0030). Datos inventados (S-31). */
class GestaskTicketsTest {

    private static final String BASE = "/api/apps/jira";
    private static final AppManifest GESTASK = new AppManifest("gestask", "Gestask", "Prueba", "tasks", AppColor.GOLD,
            AppCategory.PRODUCTIVITY, List.of(), false);
    private static final AppManifest OTHER = new AppManifest("lootboxes", "Lootboxes", "Prueba", "app",
            AppColor.ORANGE, AppCategory.LEISURE, List.of(), false);

    @TempDir
    Path dir;
    final FakeJira jira = new FakeJira();
    Store shell;
    MessageCenter center;
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        shell = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(shell, Clock.systemUTC(), id -> true);
        open();
    }

    private void open() {
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(new JiraApp(jira))), paths,
                Clock.fixed(FakeJira.NOW, ZoneOffset.UTC), manifest -> (title, text, kind, path) -> { },
                manifest -> name -> null, center::forApp);
        api = TestApi.start(List.of(registry));
    }

    private void close() {
        api.close();
        registry.close();
    }

    @AfterEach
    void stop() {
        close();
        shell.close();
    }

    private Messages gestask() {
        return center.forApp(GESTASK);
    }

    private List<String> tickets() {
        HttpResponse<String> r = api.get(BASE + "/gestask/tickets");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        List<String> out = new ArrayList<>();
        for (JsonNode t : TestApi.json(r).get("tickets")) {
            out.add(t.asText());
        }
        return out;
    }

    @Test
    void jr50_empty_until_a_list_arrives_and_each_list_replaces_the_previous_one() {
        assertThat(tickets()).isEmpty();

        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-2\",\" PROJ-1 \",\"PROJ-2\"]}");
        assertThat(tickets()).containsExactly("PROJ-1", "PROJ-2");

        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-9\"]}");
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-3\",\"PROJ-4\"]}");
        // La última manda.
        assertThat(tickets()).containsExactly("PROJ-3", "PROJ-4");
        // Todos se confirmaron.
        assertThat(center.forApp(JiraApp.MANIFEST).pending()).isEmpty();

        gestask().send("jira", "gestask-tickets", "{\"tickets\":[]}");
        assertThat(tickets()).isEmpty();
    }

    @Test
    void jr50_a_repeated_message_has_no_effect() {
        String list = "{\"tickets\":[\"PROJ-1\"]}";
        gestask().send("jira", "gestask-tickets", list);
        gestask().send("jira", "gestask-tickets", list);
        assertThat(tickets()).containsExactly("PROJ-1");
        assertThat(tickets()).containsExactly("PROJ-1");
    }

    @Test
    void jr50_other_senders_types_or_contents_are_discarded_and_acked() {
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-1\"]}");
        assertThat(tickets()).containsExactly("PROJ-1");

        center.forApp(OTHER).send("jira", "gestask-tickets", "{\"tickets\":[\"OTRO-1\"]}");
        gestask().send("jira", "effort-points", "{\"tickets\":[\"OTRO-2\"]}");
        gestask().send("jira", "gestask-tickets", "{\"tickets\":\"PROJ-5\"}");
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-6\",7]}");
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-6\",\"  \"]}");
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"" + "A".repeat(256) + "\"]}");

        assertThat(tickets()).containsExactly("PROJ-1");
        assertThat(center.forApp(JiraApp.MANIFEST).pending()).isEmpty();
    }

    @Test
    void jr50_the_list_survives_a_restart_and_never_contacts_jira() {
        gestask().send("jira", "gestask-tickets", "{\"tickets\":[\"PROJ-1\"]}");
        assertThat(tickets()).containsExactly("PROJ-1");
        close();
        open();

        assertThat(tickets()).containsExactly("PROJ-1");
        assertThat(jira.requests).isEmpty();
    }
}
