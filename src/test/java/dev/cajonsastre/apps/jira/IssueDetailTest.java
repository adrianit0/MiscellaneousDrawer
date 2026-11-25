package dev.cajonsastre.apps.jira;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.catalog.CatalogApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El detalle de un ticket por la API de «Tableros Jira» (JR-60 a JR-64), con el servidor real y Jira simulado: no
 * contacta con ningún servidor. Datos inventados (S-31).
 */
class IssueDetailTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/jira";

    @TempDir
    Path dir;
    final FakeJira jira = new FakeJira();
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(new JiraApp(jira))), paths, Clock.fixed(FakeJira.NOW, ZoneOffset.UTC));
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
    }

    // --- Ayudas ---

    private void configure() {
        HttpResponse<String> r = api.put(BASE + "/config", JiraAppTest.config().toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
    }

    private static ObjectNode status(String name, String category) {
        ObjectNode s = JSON.createObjectNode().put("id", "1").put("name", name);
        s.putObject("statusCategory").put("key", category);
        return s;
    }

    /** Un ticket breve, como lo da Jira dentro de parent, subtasks o issuelinks. */
    private static ObjectNode brief(String key, String summary, String statusName, String category, String type) {
        ObjectNode i = JSON.createObjectNode().put("id", "9").put("key", key);
        ObjectNode f = i.putObject("fields").put("summary", summary);
        f.set("status", status(statusName, category));
        f.putObject("issuetype").put("name", type);
        return i;
    }

    private static ObjectNode doc(String text) {
        ObjectNode d = JSON.createObjectNode().put("type", "doc").put("version", 1);
        d.putArray("content").addObject().put("type", "paragraph").putArray("content").addObject()
                .put("type", "text").put("text", text);
        return d;
    }

    /** Un ticket con todos los campos del detalle, con valores inventados. */
    private ObjectNode full() {
        ObjectNode i = JSON.createObjectNode().put("id", "10007").put("key", "PA-7");
        ObjectNode f = i.putObject("fields").put("summary", "Pantalla de alta")
                .put("created", "2026-11-01T09:00:00.000+0100").put("updated", "2026-11-23T09:30:00.000+0100");
        f.set("status", status("doing", "indeterminate"));
        f.putObject("issuetype").put("name", "Historia");
        f.putObject("priority").put("id", "3").put("name", "Importante");
        f.putObject("assignee").put("displayName", "Ana Inventada").put("accountId", "a1");
        f.putObject("reporter").put("displayName", "Luis Inventado");
        f.set("description", doc("Descripción <script>alert(1)</script>"));
        f.set("parent", brief("PA-1", "Épica de altas", "doing", "indeterminate", "Epic"));
        f.putArray("subtasks").add(brief("PA-8", "Validar campos", "start", "new", "Subtarea"))
                .add(brief("PA-9", "Mensajes de error", "finished", "done", "Subtarea"));
        ArrayNode links = f.putArray("issuelinks");
        ObjectNode out = links.addObject().put("id", "1");
        out.putObject("type").put("name", "Blocks").put("inward", "es bloqueado por").put("outward", "bloquea");
        out.set("outwardIssue", brief("PB-2", "Exportar a CSV", "testing", "indeterminate", "Error"));
        ObjectNode in = links.addObject().put("id", "2");
        in.putObject("type").put("name", "Blocks").put("inward", "es bloqueado por").put("outward", "bloquea");
        in.set("inwardIssue", brief("PB-3", "Informe mensual", "analized", "new", "Tarea"));
        ArrayNode attachments = f.putArray("attachment");
        attachments.addObject().put("id", "10100").put("filename", "captura.png").put("mimeType", "image/png")
                .put("size", 20480).put("created", "2026-11-20T10:00:00.000+0100")
                .put("content", "https://otro-host.example.test/descarga")
                .putObject("author").put("displayName", "Ana Inventada");
        // JR-63: sin un identificador numérico no se devuelve.
        attachments.addObject().put("id", "../x").put("filename", "raro.txt");
        f.putArray("labels").add("frontend").add("altas");
        f.putArray("components").addObject().put("id", "1").put("name", "Web");
        return i;
    }

    /** Un ticket sin nada opcional. */
    private ObjectNode bare(String key) {
        ObjectNode i = JSON.createObjectNode().put("id", "1").put("key", key);
        ObjectNode f = i.putObject("fields").put("summary", "Sin nada").put("created", "2026-11-01T09:00:00.000+0000")
                .put("updated", "2026-11-01T09:00:00.000+0000");
        f.set("status", status("start", "new"));
        f.putNull("issuetype");
        f.putNull("priority");
        f.putNull("assignee");
        f.putNull("reporter");
        f.putNull("description");
        f.putArray("subtasks");
        f.putArray("issuelinks");
        f.putArray("attachment");
        f.putArray("labels");
        f.putArray("components");
        return i;
    }

    private void comments(String key, int count) {
        List<ObjectNode> list = new ArrayList<>();
        for (int n = 1; n <= count; n++) {
            ObjectNode c = JSON.createObjectNode().put("id", String.valueOf(n))
                    .put("created", String.format("2026-11-%02dT10:00:00.000+0100", 1 + n % 28))
                    .put("updated", String.format("2026-11-%02dT10:00:00.000+0100", 1 + n % 28));
            c.putObject("author").put("displayName", "Persona " + n);
            c.set("body", doc("Comentario " + n));
            list.add(c);
        }
        jira.comments.put(key, list);
    }

    private JsonNode detail(String key) {
        HttpResponse<String> r = api.get(BASE + "/issues/" + key);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    // --- Pruebas ---

    @Test
    void jr60_jr61_the_detail_has_every_field_of_the_ticket() {
        configure();
        jira.details.put("PA-7", full());
        comments("PA-7", 2);

        JsonNode d = detail("PA-7");

        FakeJira.Request issue = jira.requests.get(0);
        assertThat(issue.method()).isEqualTo("GET");
        assertThat(issue.uri().toString()).isEqualTo(FakeJira.SITE + "/rest/api/3/issue/PA-7?fields=summary,status,issuetype,"
                + "priority,assignee,reporter,created,updated,description,parent,subtasks,issuelinks,attachment,labels,components");
        assertThat(d.get("key").asText()).isEqualTo("PA-7");
        assertThat(d.get("summary").asText()).isEqualTo("Pantalla de alta");
        assertThat(d.get("project").asText()).isEqualTo("PA");
        assertThat(d.get("status").get("name").asText()).isEqualTo("doing");
        assertThat(d.get("status").get("category").asText()).isEqualTo("indeterminate");
        assertThat(d.get("type").asText()).isEqualTo("Historia");
        assertThat(d.get("priority").get("id").asText()).isEqualTo("3");
        assertThat(d.get("priority").get("name").asText()).isEqualTo("Importante");
        assertThat(d.get("assignee").asText()).isEqualTo("Ana Inventada");
        assertThat(d.get("reporter").asText()).isEqualTo("Luis Inventado");
        assertThat(d.get("created").asText()).isEqualTo("2026-11-01T09:00:00.000+0100");
        assertThat(d.get("updated").asText()).isEqualTo("2026-11-23T09:30:00.000+0100");
        // JR-61: el ADF tal como lo da Jira; la interfaz no interpreta HTML (JR-74).
        assertThat(d.get("description")).isEqualTo(doc("Descripción <script>alert(1)</script>"));
        assertThat(d.get("parent").get("key").asText()).isEqualTo("PA-1");
        assertThat(d.get("parent").get("type").asText()).isEqualTo("Epic");
        assertThat(FakeJira.keys(d.get("subtasks"))).containsExactly("PA-8", "PA-9");
        assertThat(d.get("subtasks").get(1).get("status").get("category").asText()).isEqualTo("done");
        assertThat(d.get("subtasks").get(0).get("summary").asText()).isEqualTo("Validar campos");
        assertThat(d.get("labels")).extracting(JsonNode::asText).containsExactly("frontend", "altas");
        assertThat(d.get("components")).extracting(JsonNode::asText).containsExactly("Web");
        assertThat(d.get("fetchedAt").asText()).isEqualTo(FakeJira.NOW.toString());
    }

    @Test
    void jr61_links_are_named_from_this_ticket() {
        configure();
        jira.details.put("PA-7", full());

        JsonNode links = detail("PA-7").get("links");

        assertThat(links).hasSize(2);
        assertThat(links.get(0).get("relation").asText()).isEqualTo("bloquea");
        assertThat(links.get(0).get("issue").get("key").asText()).isEqualTo("PB-2");
        assertThat(links.get(0).get("issue").get("status").get("name").asText()).isEqualTo("testing");
        assertThat(links.get(1).get("relation").asText()).isEqualTo("es bloqueado por");
        assertThat(links.get(1).get("issue").get("key").asText()).isEqualTo("PB-3");
        assertThat(links.get(1).get("issue").get("type").asText()).isEqualTo("Tarea");
    }

    @Test
    void jr61_jr63_attachments_without_a_numeric_id_are_left_out() {
        configure();
        jira.details.put("PA-7", full());

        JsonNode attachments = detail("PA-7").get("attachments");

        assertThat(attachments).hasSize(1);
        JsonNode a = attachments.get(0);
        assertThat(a.get("id").asText()).isEqualTo("10100");
        assertThat(a.get("filename").asText()).isEqualTo("captura.png");
        assertThat(a.get("mimeType").asText()).isEqualTo("image/png");
        assertThat(a.get("size").asLong()).isEqualTo(20480);
        assertThat(a.get("author").asText()).isEqualTo("Ana Inventada");
        assertThat(a.get("created").asText()).isEqualTo("2026-11-20T10:00:00.000+0100");
        // JR-73: la URL la arma la interfaz con el sitio; la de Jira no se devuelve.
        assertThat(a.has("content")).isFalse();
    }

    @Test
    void jr61_a_ticket_without_optional_fields() {
        configure();
        jira.details.put("PB-12", bare("PB-12"));

        JsonNode d = detail("PB-12");

        assertThat(d.get("type").isNull()).isTrue();
        assertThat(d.get("priority").isNull()).isTrue();
        assertThat(d.get("assignee").isNull()).isTrue();
        assertThat(d.get("reporter").isNull()).isTrue();
        assertThat(d.get("description").isNull()).isTrue();
        assertThat(d.get("parent").isNull()).isTrue();
        assertThat(d.get("subtasks")).isEmpty();
        assertThat(d.get("links")).isEmpty();
        assertThat(d.get("attachments")).isEmpty();
        assertThat(d.get("labels")).isEmpty();
        assertThat(d.get("components")).isEmpty();
        assertThat(d.get("comments")).isEmpty();
        assertThat(d.get("commentsTruncated").asBoolean()).isFalse();
    }

    @Test
    void jr62_comments_come_newest_first_in_pages() {
        configure();
        jira.details.put("PA-7", full());
        comments("PA-7", 150);

        JsonNode d = detail("PA-7");

        List<FakeJira.Request> pages = jira.requests.stream().filter(r -> r.uri().getPath().endsWith("/comment")).toList();
        assertThat(pages).hasSize(2);
        assertThat(pages.get(0).uri().getRawQuery()).isEqualTo("orderBy=-created&maxResults=100&startAt=0");
        assertThat(pages.get(1).uri().getRawQuery()).isEqualTo("orderBy=-created&maxResults=100&startAt=100");
        JsonNode list = d.get("comments");
        assertThat(list).hasSize(150);
        assertThat(list.get(0).get("id").asText()).isEqualTo("150");
        assertThat(list.get(149).get("id").asText()).isEqualTo("1");
        assertThat(list.get(0).get("author").asText()).isEqualTo("Persona 150");
        assertThat(list.get(0).get("body")).isEqualTo(doc("Comentario 150"));
        assertThat(list.get(0).has("created")).isTrue();
        assertThat(list.get(0).has("updated")).isTrue();
        assertThat(d.get("commentsTruncated").asBoolean()).isFalse();
    }

    @Test
    void jr62_only_the_200_most_recent_comments() {
        configure();
        jira.details.put("PA-7", full());
        comments("PA-7", 250);

        JsonNode d = detail("PA-7");

        assertThat(jira.requests.stream().filter(r -> r.uri().getPath().endsWith("/comment")).count()).isEqualTo(2);
        assertThat(d.get("comments")).hasSize(200);
        assertThat(d.get("comments").get(0).get("id").asText()).isEqualTo("250");
        assertThat(d.get("comments").get(199).get("id").asText()).isEqualTo("51");
        assertThat(d.get("commentsTruncated").asBoolean()).isTrue();
    }

    @Test
    void jr63_invalid_keys_do_not_reach_jira() {
        configure();
        for (String key : List.of("pa-7", "PA-07", "PA-0", "PA7", "P-7", "PA-12345678901", "PA-7-1", "PA-7..", "A_B%20-3")) {
            assertError(api.get(BASE + "/issues/" + key), 400, "invalid_issue");
        }
        assertThat(jira.requests).isEmpty();
        assertThat(IssueDetail.ISSUE_KEY.matcher("ABC_1-1234567890").matches()).isTrue();
    }

    @Test
    void jr60_errors_are_those_of_jr04_and_jr07() {
        // JR-04: sin conexión no se contacta con Jira.
        assertError(api.get(BASE + "/issues/PA-7"), 409, "not_configured");
        assertThat(jira.requests).isEmpty();

        configure();
        HttpResponse<String> missing = api.get(BASE + "/issues/PA-404");
        assertError(missing, 502, "jira_error");
        assertThat(TestApi.json(missing).get("message").asText()).isEqualTo("No existe en Jira");

        jira.details.put("PA-7", full());
        jira.offline = true;
        assertError(api.get(BASE + "/issues/PA-7"), 502, "jira_unreachable");
    }

    @Test
    void jr64_only_reads_and_logs_nothing_of_the_ticket() {
        configure();
        jira.details.put("PA-7", full());
        comments("PA-7", 3);
        Logger logger = (Logger) LoggerFactory.getLogger(JiraApp.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        logger.addAppender(logged);
        try {
            detail("PA-7");
        } finally {
            logger.detachAppender(logged);
        }
        assertThat(jira.requests).isNotEmpty().allSatisfy(r -> assertThat(r.method()).isEqualTo("GET"));
        assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage)
                .containsExactly("Detalle de ticket consultado: 3 comentarios");
    }
}
