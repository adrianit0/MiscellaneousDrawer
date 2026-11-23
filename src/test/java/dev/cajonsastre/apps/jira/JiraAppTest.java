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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * «Tableros Jira» por su API, con el servidor real y Jira simulado (JR-01 a JR-25): no contacta con ningún servidor.
 * Datos inventados (S-31).
 */
class JiraAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/jira";
    private static final FakeJira.Status START = new FakeJira.Status("10001", "start", "new");
    private static final FakeJira.Status DOING = new FakeJira.Status("10002", "doing", "indeterminate");
    /** Un estado compartido por los dos proyectos (gestionados por la empresa). */
    private static final FakeJira.Status TESTING = new FakeJira.Status("10003", "testing", "indeterminate");
    private static final FakeJira.Status FINISHED = new FakeJira.Status("10004", "finished", "done");
    private static final FakeJira.Status CREATED = new FakeJira.Status("20001", "created", "new");
    private static final FakeJira.Status ANALIZED = new FakeJira.Status("20002", "analized", "new");
    private static final FakeJira.Status INPROGRESS = new FakeJira.Status("20003", "inprogress", "indeterminate");
    private static final FakeJira.Status CLOSED = new FakeJira.Status("20005", "closed", "done");

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

    static ObjectNode config() {
        return JSON.createObjectNode().put("siteUrl", FakeJira.SITE + "/").put("email", FakeJira.EMAIL)
                .put("token", FakeJira.TOKEN);
    }

    private JsonNode save(ObjectNode body) {
        HttpResponse<String> r = api.put(BASE + "/config", body.toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    private void assertInvalidConfig(ObjectNode body, String field) {
        HttpResponse<String> r = api.put(BASE + "/config", body.toString());
        assertError(r, 400, "invalid_config");
        assertThat(TestApi.json(r).get("details").get("field").asText()).as(body.toString()).isEqualTo(field);
    }

    /** Los dos proyectos del ejemplo del usuario (ADR-0027), con claves inventadas. */
    private void example() {
        jira.project("PA", "Proyecto A", START, DOING, TESTING, FINISHED);
        jira.project("PB", "Proyecto B", CREATED, ANALIZED, INPROGRESS, TESTING, CLOSED);
    }

    private static ObjectNode status(String project, FakeJira.Status s) {
        return JSON.createObjectNode().put("project", project).put("id", s.id()).put("name", s.name());
    }

    private static ObjectNode column(String name, ObjectNode... statuses) {
        ObjectNode c = JSON.createObjectNode().put("name", name);
        ArrayNode list = c.putArray("statuses");
        for (ObjectNode s : statuses) {
            list.add(s);
        }
        return c;
    }

    /** El tablero del ejemplo: To do, In progress, Testing y Closed. */
    static ObjectNode exampleBoard(String name) {
        ObjectNode b = JSON.createObjectNode().put("name", name);
        b.putArray("projects").add("PA").add("PB");
        b.putArray("columns")
                .add(column("To do", status("PA", START), status("PB", CREATED), status("PB", ANALIZED)))
                .add(column("In progress", status("PA", DOING), status("PB", INPROGRESS)))
                .add(column("Testing", status("PA", TESTING), status("PB", TESTING)))
                .add(column("Closed", status("PA", FINISHED), status("PB", CLOSED)));
        return b;
    }

    private long create(ObjectNode board) {
        HttpResponse<String> r = api.post(BASE + "/boards", board.toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return TestApi.json(r).get("id").asLong();
    }

    private void assertInvalidBoard(ObjectNode board, String field) {
        HttpResponse<String> r = api.post(BASE + "/boards", board.toString());
        assertError(r, 400, "invalid_board");
        assertThat(TestApi.json(r).get("details").get("field").asText()).as(board.toString()).isEqualTo(field);
    }

    private JsonNode issues(long id) {
        HttpResponse<String> r = api.get(BASE + "/boards/" + id + "/issues");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private static List<String> column(JsonNode result, int index) {
        return FakeJira.keys(result.get("columns").get(index).get("issues"));
    }

    // --- Conexión ---

    @Test
    void jr01_jr03_jr04_the_connection_starts_empty_and_the_token_never_comes_back() throws Exception {
        Path file = dir.resolve("config/apps/jira/config.json");
        JsonNode empty = TestApi.json(api.get(BASE + "/config"));
        assertThat(empty.get("tokenSet").asBoolean()).isFalse();
        assertThat(empty.get("missing")).extracting(JsonNode::asText).containsExactly("siteUrl", "email", "token");
        assertThat(file).doesNotExist();

        JsonNode saved = save(config());
        assertThat(saved.get("siteUrl").asText()).isEqualTo(FakeJira.SITE);
        assertThat(saved.get("email").asText()).isEqualTo(FakeJira.EMAIL);
        assertThat(saved.get("tokenSet").asBoolean()).isTrue();
        assertThat(saved.has("token")).isFalse();
        assertThat(saved.get("missing")).isEmpty();
        assertThat(api.get(BASE + "/config").body()).doesNotContain(FakeJira.TOKEN);
        assertThat(Files.readString(file)).contains(FakeJira.TOKEN);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }

        // JR-03: sin token en el cuerpo, se conserva; vacío, se borra.
        ObjectNode again = config();
        again.remove("token");
        assertThat(save(again).get("tokenSet").asBoolean()).isTrue();
        ObjectNode erase = config().put("token", "");
        JsonNode erased = save(erase);
        assertThat(erased.get("tokenSet").asBoolean()).isFalse();
        assertThat(erased.get("missing")).extracting(JsonNode::asText).containsExactly("token");
    }

    @Test
    void jr01_an_unreadable_file_is_ignored() throws Exception {
        stop();
        Path file = dir.resolve("config/apps/jira/config.json");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "{\"siteUrl\": \"https://evil.example.test\", \"email\": \"a@b\", \"token\": \"t\"}");
        start();
        assertThat(TestApi.json(api.get(BASE + "/config")).get("missing")).hasSize(3);
    }

    @Test
    void jr02_each_written_value_is_validated_and_saving_never_contacts_jira() {
        assertInvalidConfig(config().put("siteUrl", "https://evil.example.test"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "http://empresa.atlassian.net"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "https://empresa.atlassian.net/jira"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "https://empresa.atlassian.net?x=1"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "https://user@empresa.atlassian.net"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "https://empresa.atlassian.net.evil.test"), "siteUrl");
        assertInvalidConfig(config().put("siteUrl", "http://example.test:8080"), "siteUrl");
        assertInvalidConfig(config().put("email", "sin-arroba"), "email");
        assertInvalidConfig(config().put("email", "con espacio@example.test"), "email");
        assertInvalidConfig(config().put("token", "con espacio"), "token");
        // A medias y en local para las pruebas.
        assertThat(save(JSON.createObjectNode().put("siteUrl", "http://127.0.0.1:8089")).get("missing"))
                .extracting(JsonNode::asText).containsExactly("email", "token");
        assertThat(jira.requests).isEmpty();
    }

    @Test
    void jr04_without_a_complete_connection_nothing_contacts_jira() {
        save(JSON.createObjectNode().put("siteUrl", FakeJira.SITE));
        HttpResponse<String> r = api.post(BASE + "/connection/test", "");
        assertError(r, 409, "not_configured");
        assertThat(TestApi.json(r).get("details").get("missing")).extracting(JsonNode::asText).containsExactly("email", "token");
        assertError(api.get(BASE + "/projects?query=x"), 409, "not_configured");
        assertError(api.get(BASE + "/projects/PA/statuses"), 409, "not_configured");
        long id = create(exampleBoard("Equipo"));
        assertError(api.get(BASE + "/boards/" + id + "/issues"), 409, "not_configured");
        assertThat(jira.requests).isEmpty();
    }

    @Test
    void jr05_jr06_the_test_calls_myself_with_basic_authentication() {
        save(config());
        HttpResponse<String> r = api.post(BASE + "/connection/test", "");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        assertThat(TestApi.json(r).get("user").asText()).isEqualTo("Persona Inventada");
        FakeJira.Request request = jira.requests.get(0);
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.uri().toString()).isEqualTo(FakeJira.SITE + "/rest/api/3/myself");
        String basic = Base64.getEncoder().encodeToString((FakeJira.EMAIL + ":" + FakeJira.TOKEN).getBytes(StandardCharsets.UTF_8));
        assertThat(request.headers()).containsEntry("Authorization", "Basic " + basic).containsEntry("Accept", "application/json");
    }

    @Test
    void jr07_jira_errors_are_explained_to_the_user() {
        save(config());
        String[][] cases = {
                {"401", "El email o el token no son válidos"},
                {"403", "Tu cuenta no tiene permiso para ver esto"},
                {"404", "No existe en Jira"},
                {"429", "Jira limita las peticiones: prueba de nuevo en un minuto"},
        };
        for (String[] c : cases) {
            jira.forced = new Transport.Reply(Integer.parseInt(c[0]), "");
            HttpResponse<String> r = api.post(BASE + "/connection/test", "");
            assertError(r, 502, "jira_error");
            assertThat(TestApi.json(r).get("message").asText()).isEqualTo(c[1]);
        }
        jira.forced = new Transport.Reply(400, "{\"errorMessages\":[\"El JQL no es válido\"]}");
        assertThat(TestApi.json(api.post(BASE + "/connection/test", "")).get("message").asText()).isEqualTo("El JQL no es válido");
        jira.forced = new Transport.Reply(500, "<html>");
        assertThat(TestApi.json(api.post(BASE + "/connection/test", "")).get("message").asText())
                .isEqualTo("Jira respondió con el error HTTP 500");
        jira.forced = null;
        jira.offline = true;
        HttpResponse<String> r = api.post(BASE + "/connection/test", "");
        assertError(r, 502, "jira_unreachable");
        assertThat(TestApi.json(r).get("message").asText()).isEqualTo("No hay contacto con Jira");

        // El token caducado se ve igual que uno incorrecto.
        jira.offline = false;
        save(config().put("token", "otro-token"));
        assertThat(TestApi.json(api.post(BASE + "/connection/test", "")).get("message").asText())
                .isEqualTo("El email o el token no son válidos");
    }

    // --- Proyectos y estados ---

    @Test
    void jr10_projects_are_searched_by_text_in_pages() {
        save(config());
        for (int i = 0; i < 120; i++) {
            jira.project("P" + String.format("%03d", i), "Proyecto " + i);
        }
        JsonNode all = TestApi.json(api.get(BASE + "/projects?query="));
        assertThat(all.get("projects")).hasSize(120);
        assertThat(all.get("projects").get(0).get("key").asText()).isEqualTo("P000");
        assertThat(all.get("projects").get(0).get("name").asText()).isEqualTo("Proyecto 0");
        assertThat(jira.requests).hasSize(3);
        assertThat(jira.requests.get(1).query()).containsEntry("startAt", "50").containsEntry("maxResults", "50")
                .containsEntry("orderBy", "key");

        JsonNode some = TestApi.json(api.get(BASE + "/projects?query=P11"));
        assertThat(some.get("projects")).extracting(p -> p.get("key").asText()).containsExactly(
                "P110", "P111", "P112", "P113", "P114", "P115", "P116", "P117", "P118", "P119");
    }

    @Test
    void jr11_jr12_statuses_of_a_project_without_repeats_and_keys_are_validated() {
        save(config());
        example();
        JsonNode r = TestApi.json(api.get(BASE + "/projects/PB/statuses"));
        assertThat(r.get("statuses")).extracting(s -> s.get("name").asText())
                .containsExactly("created", "analized", "inprogress", "testing", "closed");
        assertThat(r.get("statuses").get(0).get("id").asText()).isEqualTo("20001");
        assertThat(r.get("statuses").get(4).get("category").asText()).isEqualTo("done");

        int before = jira.requests.size();
        assertThat(api.get(BASE + "/projects/pb/statuses").statusCode()).isEqualTo(400);
        assertThat(api.get(BASE + "/projects/P%20OR%201/statuses").statusCode()).isEqualTo(400);
        assertThat(jira.requests).hasSize(before);
    }

    // --- Tableros ---

    @Test
    void jr13_jr14_jr15_jr16_boards_are_created_listed_replaced_and_deleted_without_contacting_jira() {
        assertThat(TestApi.json(api.get(BASE + "/boards")).get("boards")).isEmpty();
        long first = create(exampleBoard("Equipo"));
        long second = create(exampleBoard("Soporte"));
        JsonNode boards = TestApi.json(api.get(BASE + "/boards")).get("boards");
        assertThat(boards).extracting(b -> b.get("name").asText()).containsExactly("Equipo", "Soporte");
        JsonNode board = boards.get(0);
        assertThat(board.get("id").asLong()).isEqualTo(first);
        assertThat(board.get("projects")).extracting(JsonNode::asText).containsExactly("PA", "PB");
        assertThat(board.get("columns")).extracting(c -> c.get("name").asText())
                .containsExactly("To do", "In progress", "Testing", "Closed");
        assertThat(board.get("columns").get(2).get("statuses")).hasSize(2);
        assertThat(board.get("columns").get(0).get("statuses").get(1).get("name").asText()).isEqualTo("created");

        ObjectNode changed = exampleBoard("Equipo 2");
        ((ArrayNode) changed.get("columns")).remove(2);
        HttpResponse<String> r = api.put(BASE + "/boards/" + first, changed.toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        assertThat(TestApi.json(api.get(BASE + "/boards")).get("boards").get(0).get("columns")).hasSize(3);

        assertError(api.put(BASE + "/boards/" + second, exampleBoard("equipo 2").toString()), 400, "invalid_board");
        assertThat(api.put(BASE + "/boards/" + second, exampleBoard("Soporte").toString()).statusCode()).isEqualTo(200);
        assertThat(api.send("DELETE", BASE + "/boards/" + first, null).statusCode()).isEqualTo(204);
        assertError(api.send("DELETE", BASE + "/boards/" + first, null), 404, "not_found");
        assertError(api.put(BASE + "/boards/" + first, exampleBoard("X").toString()), 404, "not_found");
        assertError(api.get(BASE + "/boards/abc/issues"), 404, "not_found");
        assertThat(TestApi.json(api.get(BASE + "/boards")).get("boards")).extracting(b -> b.get("name").asText())
                .containsExactly("Soporte");
        assertThat(jira.requests).isEmpty();
    }

    @Test
    void jr13_boards_survive_a_restart() {
        long id = create(exampleBoard("Equipo"));
        stop();
        start();
        JsonNode boards = TestApi.json(api.get(BASE + "/boards")).get("boards");
        assertThat(boards).hasSize(1);
        assertThat(boards.get(0).get("id").asLong()).isEqualTo(id);
        assertThat(boards.get(0).get("columns").get(3).get("statuses").get(1).get("id").asText()).isEqualTo("20005");
    }

    @Test
    void jr13_there_can_be_twenty_boards_at_most() {
        for (int i = 0; i < 20; i++) {
            create(exampleBoard("Tablero " + i));
        }
        assertError(api.post(BASE + "/boards", exampleBoard("Uno más").toString()), 409, "too_many_boards");
    }

    @Test
    void jr14_a_board_that_does_not_follow_the_rules_is_rejected() {
        create(exampleBoard("Equipo"));
        assertInvalidBoard(exampleBoard("EQUIPO"), "name");
        assertInvalidBoard(exampleBoard(""), "name");
        assertInvalidBoard(exampleBoard("x".repeat(61)), "name");

        ObjectNode noProjects = exampleBoard("A");
        noProjects.putArray("projects");
        assertInvalidBoard(noProjects, "projects");
        ObjectNode badKey = exampleBoard("B");
        ((ArrayNode) badKey.get("projects")).add("p\" OR 1=1");
        assertInvalidBoard(badKey, "projects");
        ObjectNode repeated = exampleBoard("C");
        ((ArrayNode) repeated.get("projects")).add("PA");
        assertInvalidBoard(repeated, "projects");
        ObjectNode many = exampleBoard("D");
        ArrayNode list = many.putArray("projects");
        for (int i = 0; i < 11; i++) {
            list.add("P" + i + "X");
        }
        assertInvalidBoard(many, "projects");

        ObjectNode noColumns = exampleBoard("E");
        noColumns.putArray("columns");
        assertInvalidBoard(noColumns, "columns");
        ObjectNode sameColumn = exampleBoard("F");
        ((ArrayNode) sameColumn.get("columns")).add(column("to do"));
        assertInvalidBoard(sameColumn, "columns");
        ObjectNode twice = exampleBoard("G");
        ((ArrayNode) twice.get("columns")).add(column("Otra", status("PA", START)));
        assertInvalidBoard(twice, "columns");
        ObjectNode foreign = exampleBoard("H");
        ((ArrayNode) foreign.get("columns")).add(column("Otra", status("PC", START)));
        assertInvalidBoard(foreign, "columns");
        ObjectNode badId = exampleBoard("I");
        ((ArrayNode) badId.get("columns")).add(column("Otra",
                JSON.createObjectNode().put("project", "PA").put("id", "1) OR (1").put("name", "x")));
        assertInvalidBoard(badId, "columns");

        // Una columna sin estados vale.
        ObjectNode emptyColumn = exampleBoard("J");
        ((ArrayNode) emptyColumn.get("columns")).insert(0, column("Ideas"));
        create(emptyColumn);
    }

    /** El tablero del ejemplo con colores en sus estados y las prioridades del usuario (ADR-0028). */
    private static ObjectNode colorfulBoard(String name) {
        ObjectNode b = exampleBoard(name);
        b.get("columns").forEach(c -> c.get("statuses").forEach(st -> ((ObjectNode) st).put("color", "blue")));
        ((ObjectNode) b.get("columns").get(2).get("statuses").get(1)).put("color", "violet");
        b.putArray("priorities")
                .add(priority("1", "Supone un impedimento", "red"))
                .add(priority("2", "Crítica", "orange"))
                .add(priority("3", "Importante", "gold"));
        return b;
    }

    private static ObjectNode priority(String id, String name, String color) {
        return JSON.createObjectNode().put("id", id).put("name", name).put("color", color);
    }

    @Test
    void jr17_jr18_status_colors_and_priorities_are_saved_with_the_board() {
        long id = create(colorfulBoard("Equipo"));
        stop();
        start();
        JsonNode board = TestApi.json(api.get(BASE + "/boards")).get("boards").get(0);
        assertThat(board.get("id").asLong()).isEqualTo(id);
        assertThat(board.get("columns").get(2).get("statuses")).extracting(st -> st.get("color").asText())
                .containsExactly("blue", "violet");
        assertThat(board.get("priorities")).extracting(pr -> pr.get("id").asText() + " " + pr.get("name").asText()
                + " " + pr.get("color").asText())
                .containsExactly("1 Supone un impedimento red", "2 Crítica orange", "3 Importante gold");
        assertThat(jira.requests).isEmpty();
    }

    @Test
    void jr17_jr18_colors_outside_the_palette_and_bad_priorities_are_rejected() {
        ObjectNode badStatusColor = colorfulBoard("A");
        ((ObjectNode) badStatusColor.get("columns").get(0).get("statuses").get(0)).put("color", "#ff0000");
        assertInvalidBoard(badStatusColor, "columns");
        ObjectNode badPriorityColor = colorfulBoard("B");
        ((ArrayNode) badPriorityColor.get("priorities")).add(priority("4", "Trivial", "pink"));
        assertInvalidBoard(badPriorityColor, "priorities");
        ObjectNode repeated = colorfulBoard("C");
        ((ArrayNode) repeated.get("priorities")).add(priority("1", "Otra vez", "gray"));
        assertInvalidBoard(repeated, "priorities");
        ObjectNode badId = colorfulBoard("D");
        ((ArrayNode) badId.get("priorities")).add(priority("1) OR (1", "Rara", "gray"));
        assertInvalidBoard(badId, "priorities");
        ObjectNode noName = colorfulBoard("E");
        ((ArrayNode) noName.get("priorities")).add(priority("9", " ", "gray"));
        assertInvalidBoard(noName, "priorities");
        ObjectNode many = colorfulBoard("F");
        ArrayNode list = many.putArray("priorities");
        for (int i = 1; i <= 21; i++) {
            list.add(priority(String.valueOf(i), "P" + i, "gray"));
        }
        assertInvalidBoard(many, "priorities");
        ObjectNode notList = colorfulBoard("G");
        notList.put("priorities", "Importante");
        assertInvalidBoard(notList, "priorities");

        // Veinte valen, y un color null es el gris.
        list.remove(20);
        ((ObjectNode) many.get("columns").get(0).get("statuses").get(0)).putNull("color");
        create(many);
        JsonNode saved = TestApi.json(api.get(BASE + "/boards")).get("boards").get(0);
        assertThat(saved.get("priorities")).hasSize(20);
        assertThat(saved.get("columns").get(0).get("statuses").get(0).get("color").asText()).isEqualTo("gray");
    }

    @Test
    void jr18_a_board_saved_before_colors_and_priorities_reads_in_gray_and_without_priorities() throws Exception {
        // La definición tal como la guardaba el sprint 13.
        JsonNode stored = JSON.readTree("""
                {"name": "Antiguo", "projects": ["PA"],
                 "columns": [{"name": "To do", "statuses": [{"project": "PA", "id": "10001", "name": "start"}]},
                             {"name": "Closed", "statuses": [{"project": "PA", "id": "10004", "name": "finished"}]}]}
                """);
        Board board = Board.from(7, stored);
        assertThat(board.columns()).allSatisfy(c -> assertThat(c.statuses())
                .allSatisfy(st -> assertThat(st.color()).isEqualTo("gray")));
        assertThat(board.priorities()).isEmpty();
        assertThat(board.view().get("priorities")).isEqualTo(List.of());
    }

    @Test
    void jr19_priorities_are_listed_in_pages_in_jiras_order() {
        assertError(api.get(BASE + "/priorities"), 409, "not_configured");
        assertThat(jira.requests).isEmpty();
        save(config());
        for (int i = 1; i <= 60; i++) {
            jira.priorities.put(String.valueOf(1000 - i), "Prioridad " + i);
        }
        jira.priorities.put("no-es-un-id", "Rara");
        JsonNode list = TestApi.json(api.get(BASE + "/priorities")).get("priorities");
        assertThat(list).hasSize(60);
        assertThat(list.get(0).get("id").asText()).isEqualTo("999");
        assertThat(list.get(0).get("name").asText()).isEqualTo("Prioridad 1");
        assertThat(list.get(59).get("name").asText()).isEqualTo("Prioridad 60");
        assertThat(jira.requests).extracting(r -> r.uri().getPath()).containsOnly("/rest/api/3/priority/search");
        assertThat(jira.requests).extracting(r -> r.query().get("startAt")).containsExactly("0", "50");
        assertThat(jira.requests).allSatisfy(r -> assertThat(r.query().get("maxResults")).isEqualTo("50"));
    }

    // --- Tickets ---

    @Test
    void jr20_each_ticket_has_its_status_color_and_its_priority_with_the_boards_color() {
        save(config());
        example();
        jira.priorities.put("1", "Supone un impedimento");
        jira.priorities.put("3", "Importante");
        jira.priorities.put("4", "Trivial");
        jira.issue("PA-6", "PA", TESTING.id(), "Validar importación", "Luis", Duration.ofHours(1));
        jira.issue("PB-2", "PB", TESTING.id(), "Exportar a CSV", "Ana", Duration.ofHours(2));
        jira.issue("PB-3", "PB", TESTING.id(), "Sin prioridad", null, Duration.ofHours(3));
        jira.issuePriority.put("PA-6", "3");
        jira.issuePriority.put("PB-2", "4");
        long id = create(colorfulBoard("Equipo"));

        JsonNode testing = issues(id).get("columns").get(2).get("issues");
        assertThat(FakeJira.keys(testing)).containsExactly("PA-6", "PB-2", "PB-3");
        // El mismo estado tiene el color de su par: azul en PA y violeta en PB.
        assertThat(testing).extracting(i -> i.get("statusColor").asText()).containsExactly("blue", "violet", "violet");
        JsonNode configured = testing.get(0).get("priority");
        assertThat(configured.get("id").asText()).isEqualTo("3");
        assertThat(configured.get("name").asText()).isEqualTo("Importante");
        assertThat(configured.get("color").asText()).isEqualTo("gold");
        // Trivial no está en el tablero: llega con su nombre y sin color.
        JsonNode unconfigured = testing.get(1).get("priority");
        assertThat(unconfigured.get("name").asText()).isEqualTo("Trivial");
        assertThat(unconfigured.get("color").isNull()).isTrue();
        assertThat(testing.get(2).get("priority").isNull()).isTrue();
    }

    @Test
    void jr20_jr21_jr22_the_example_board_puts_each_ticket_in_its_column() {
        save(config());
        example();
        jira.issue("PA-7", "PA", DOING.id(), "Pantalla de alta", "Ana", Duration.ofHours(1));
        jira.issue("PB-3", "PB", ANALIZED.id(), "Informe mensual", null, Duration.ofHours(2));
        jira.issue("PA-6", "PA", TESTING.id(), "Validar importación", "Luis", Duration.ofHours(3));
        jira.issue("PB-2", "PB", TESTING.id(), "Exportar a CSV", "Ana", Duration.ofHours(4));
        jira.issue("PA-5", "PA", START.id(), "Nuevo filtro", "Luis", Duration.ofDays(1));
        jira.issue("PB-1", "PB", CLOSED.id(), "Cerrado hace poco", "Ana", Duration.ofDays(13));
        jira.issue("PA-1", "PA", FINISHED.id(), "Cerrado hace mucho", "Luis", Duration.ofDays(15));
        jira.issue("PA-4", "PA", START.id(), "Antiguo pero abierto", null, Duration.ofDays(200));
        long id = create(exampleBoard("Equipo"));

        JsonNode result = issues(id);
        assertThat(result.get("board").get("name").asText()).isEqualTo("Equipo");
        assertThat(result.get("columns")).extracting(c -> c.get("name").asText())
                .containsExactly("To do", "In progress", "Testing", "Closed");
        assertThat(column(result, 0)).containsExactly("PB-3", "PA-5", "PA-4");
        assertThat(column(result, 1)).containsExactly("PA-7");
        assertThat(column(result, 2)).containsExactly("PA-6", "PB-2");
        // JR-21: en la columna final, solo lo actualizado en los últimos 14 días.
        assertThat(column(result, 3)).containsExactly("PB-1");

        JsonNode ticket = result.get("columns").get(0).get("issues").get(0);
        assertThat(ticket.get("key").asText()).isEqualTo("PB-3");
        assertThat(ticket.get("summary").asText()).isEqualTo("Informe mensual");
        assertThat(ticket.get("project").asText()).isEqualTo("PB");
        assertThat(ticket.get("status").asText()).isEqualTo("analized");
        assertThat(ticket.get("assignee").isNull()).isTrue();
        assertThat(result.get("columns").get(1).get("issues").get(0).get("assignee").asText()).isEqualTo("Ana");
        assertThat(result.get("fetchedAt").asText()).isEqualTo(FakeJira.NOW.toString());
        assertThat(result.get("truncated").asBoolean()).isFalse();
        assertThat(result.get("missingStatuses")).isEmpty();

        FakeJira.Request search = jira.searches().get(0);
        assertThat(search.json().get("jql").asText()).isEqualTo(
                "(project = \"PA\" AND (status in (10001, 10002, 10003) OR (status in (10004) AND updated >= -14d)))"
                        + " OR (project = \"PB\" AND (status in (20001, 20002, 20003, 10003) OR (status in (20005) AND updated >= -14d)))"
                        + " ORDER BY updated DESC");
        assertThat(search.json().get("fields")).extracting(JsonNode::asText)
                .containsExactly("summary", "status", "assignee", "project", "priority", "updated");
        assertThat(search.json().get("maxResults").asInt()).isEqualTo(100);
    }

    @Test
    void jr21_jr22_the_same_status_id_can_go_to_different_columns_in_each_project() {
        save(config());
        example();
        jira.issue("PA-1", "PA", TESTING.id(), "En pruebas", null, Duration.ofDays(30));
        jira.issue("PB-1", "PB", TESTING.id(), "Para PB es cerrado", null, Duration.ofDays(30));
        jira.issue("PB-2", "PB", TESTING.id(), "Para PB es cerrado y reciente", null, Duration.ofDays(1));
        ObjectNode board = JSON.createObjectNode().put("name", "Mixto");
        board.putArray("projects").add("PA").add("PB");
        board.putArray("columns").add(column("Testing", status("PA", TESTING))).add(column("Closed", status("PB", TESTING)));
        JsonNode result = issues(create(board));
        assertThat(column(result, 0)).containsExactly("PA-1");
        assertThat(column(result, 1)).containsExactly("PB-2");
    }

    @Test
    void jr21_only_one_part_or_none_when_a_list_is_empty() {
        save(config());
        example();
        jira.issue("PA-1", "PA", FINISHED.id(), "Hecho", null, Duration.ofDays(1));
        ObjectNode onlyClosed = JSON.createObjectNode().put("name", "Cerrados");
        onlyClosed.putArray("projects").add("PA");
        onlyClosed.putArray("columns").add(column("Abiertos")).add(column("Cerrados", status("PA", FINISHED)));
        JsonNode result = issues(create(onlyClosed));
        assertThat(column(result, 1)).containsExactly("PA-1");
        assertThat(jira.searches().get(0).json().get("jql").asText())
                .isEqualTo("(project = \"PA\" AND ((status in (10004) AND updated >= -14d))) ORDER BY updated DESC");

        ObjectNode onlyOpen = JSON.createObjectNode().put("name", "Abiertos");
        onlyOpen.putArray("projects").add("PA").add("PB");
        onlyOpen.putArray("columns").add(column("Abiertos", status("PA", START))).add(column("Cerrados"));
        issues(create(onlyOpen));
        assertThat(jira.searches().get(1).json().get("jql").asText())
                .isEqualTo("(project = \"PA\" AND (status in (10001))) ORDER BY updated DESC");

        ObjectNode none = JSON.createObjectNode().put("name", "Vacío");
        none.putArray("projects").add("PA");
        none.putArray("columns").add(column("Una"));
        JsonNode empty = issues(create(none));
        assertThat(empty.get("columns").get(0).get("issues")).isEmpty();
        assertThat(jira.searches()).hasSize(2);
    }

    @Test
    void jr20_statuses_that_jira_no_longer_has_are_reported_and_left_out_of_the_query() {
        save(config());
        example();
        jira.issue("PB-1", "PB", CREATED.id(), "Sigue", null, Duration.ofDays(1));
        ObjectNode board = exampleBoard("Equipo");
        ((ArrayNode) board.get("projects")).add("PGONE");
        ((ArrayNode) board.get("columns").get(0).get("statuses"))
                .add(JSON.createObjectNode().put("project", "PB").put("id", "29999").put("name", "borrado"))
                .add(JSON.createObjectNode().put("project", "PGONE").put("id", "30001").put("name", "nuevo"));
        JsonNode result = issues(create(board));
        assertThat(result.get("missingStatuses")).hasSize(2);
        JsonNode first = result.get("missingStatuses").get(0);
        assertThat(first.get("project").asText()).isEqualTo("PB");
        assertThat(first.get("id").asText()).isEqualTo("29999");
        assertThat(first.get("name").asText()).isEqualTo("borrado");
        assertThat(first.get("column").asText()).isEqualTo("To do");
        assertThat(result.get("missingStatuses").get(1).get("project").asText()).isEqualTo("PGONE");
        String jql = jira.searches().get(0).json().get("jql").asText();
        assertThat(jql).doesNotContain("29999").doesNotContain("PGONE");
        assertThat(column(result, 0)).containsExactly("PB-1");
    }

    @Test
    void jr23_at_most_a_thousand_tickets_are_read() {
        save(config());
        example();
        for (int i = 0; i < 1050; i++) {
            jira.issue("PA-" + (2000 - i), "PA", START.id(), "Ticket " + i, null, Duration.ofMinutes(i));
        }
        JsonNode result = issues(create(exampleBoard("Grande")));
        assertThat(result.get("columns").get(0).get("issues")).hasSize(1000);
        assertThat(column(result, 0).get(0)).isEqualTo("PA-2000");
        assertThat(result.get("truncated").asBoolean()).isTrue();
        assertThat(jira.searches()).hasSize(10);
        assertThat(jira.searches().get(1).json().get("nextPageToken").asText()).isEqualTo("100");

        jira.issues.subList(1000, 1050).clear();
        jira.requests.clear();
        JsonNode exact = issues(TestApi.json(api.get(BASE + "/boards")).get("boards").get(0).get("id").asLong());
        assertThat(exact.get("truncated").asBoolean()).isFalse();
    }

    @Test
    void jr24_jr25_only_reads_from_jira_and_logs_no_user_data() {
        save(config());
        example();
        jira.issue("PA-7", "PA", DOING.id(), "Resumen secreto", "Ana", Duration.ofHours(1));
        long id = create(exampleBoard("Equipo"));
        Logger logger = (Logger) LoggerFactory.getLogger(JiraApp.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        logger.addAppender(logged);
        try {
            api.post(BASE + "/connection/test", "");
            api.get(BASE + "/projects?query=P");
            api.get(BASE + "/projects/PA/statuses");
            api.get(BASE + "/priorities");
            issues(id);
        } finally {
            logger.detachAppender(logged);
        }
        assertThat(jira.requests).allSatisfy(r -> assertThat(r.method().equals("GET")
                || (r.method().equals("POST") && r.uri().getPath().equals("/rest/api/3/search/jql"))).isTrue());
        assertThat(jira.requests).allSatisfy(r -> assertThat(r.uri().toString()).startsWith(FakeJira.SITE + "/rest/api/3/"));
        assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage)
                .containsExactly("Tablero " + id + " consultado: 1 tickets");
    }
}
