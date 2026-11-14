package dev.cajonsastre.apps.processes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.catalog.CatalogApi;
import dev.cajonsastre.consoles.ConsoleCenter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La mini app entera por su API, con el servidor real y una tabla de procesos simulada (CP-01 a CP-23): no ve ni cierra
 * ningún proceso del equipo. Datos inventados (S-31).
 */
class ProcessesAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/processes";
    private static final String IDE = "/opt/idea/bin/idea -Didea.paths.selector=IntelliJIdea";
    private static final String API = "/usr/lib/jvm/bin/java -javaagent:/opt/idea/lib/idea_rt.jar com.example.DemoApi";

    @TempDir
    Path dir;
    final FakeProcesses table = new FakeProcesses();
    final ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        boot();
    }

    @AfterEach
    void stop() {
        shutdown();
    }

    private void boot() {
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(new ProcessesApp(table))), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> { }, consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    private void shutdown() {
        api.close();
        registry.close();
    }

    private void restart() {
        shutdown();
        boot();
    }

    // --- Ayudas ---

    private Path file() {
        return dir.resolve("config/apps/processes/profiles.json");
    }

    private static ObjectNode profile(String name, String pattern, Integer from, Integer to) {
        ObjectNode node = JSON.createObjectNode().put("name", name).put("processPattern", pattern);
        node.put("portFrom", from);
        node.put("portTo", to);
        return node;
    }

    private JsonNode profiles() {
        return TestApi.json(api.get(BASE + "/profiles")).get("profiles");
    }

    private int create(ObjectNode body) {
        HttpResponse<String> r = api.post(BASE + "/profiles", body.toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return TestApi.json(r).get("id").asInt();
    }

    private JsonNode scan(int id) {
        HttpResponse<String> r = api.get(BASE + "/profiles/" + id + "/scan");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private JsonNode close(int id, String pids) {
        HttpResponse<String> r = api.post(BASE + "/profiles/" + id + "/close", "{\"pids\":" + pids + "}");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return TestApi.json(r);
    }

    private static List<Long> longs(JsonNode array) {
        List<Long> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asLong()));
        return out;
    }

    private static List<Long> pids(JsonNode scan) {
        List<Long> out = new ArrayList<>();
        scan.get("processes").forEach(p -> out.add(p.get("pid").asLong()));
        return out;
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    private static void assertInvalid(HttpResponse<String> r, String field) {
        assertError(r, 400, "invalid_profile");
        assertThat(TestApi.json(r).get("details").get("field").asText()).isEqualTo(field);
    }

    // --- Perfiles ---

    @Test
    void cp02_without_a_file_there_is_the_intellij_profile_and_nothing_is_written() {
        JsonNode list = profiles();
        assertThat(list).hasSize(1);
        JsonNode intellij = list.get(0);
        assertThat(intellij.get("id").asInt()).isEqualTo(1);
        assertThat(intellij.get("name").asText()).isEqualTo("IntelliJ IDEA");
        assertThat(intellij.get("processPattern").asText()).isEqualTo("idea|IntelliJ");
        assertThat(intellij.get("portFrom").asInt()).isEqualTo(8080);
        assertThat(intellij.get("portTo").asInt()).isEqualTo(8090);
        assertThat(file()).doesNotExist();
    }

    @Test
    void cp01_cp04_creates_modifies_and_deletes_profiles_and_keeps_them_in_a_private_file() throws IOException {
        int id = create(profile("  Servidor de pruebas  ", null, 3000, 3000));
        assertThat(id).isEqualTo(2);
        assertThat(profiles()).extracting(p -> p.get("name").asText()).containsExactly("IntelliJ IDEA", "Servidor de pruebas");
        assertThat(profiles().get(1).get("processPattern").isNull()).isTrue();
        assertThat(file()).isRegularFile();
        if (file().getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file()))).isEqualTo("rw-------");
        }

        HttpResponse<String> updated = api.put(BASE + "/profiles/" + id, profile("Node", "node .*server", null, null).toString());
        assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
        assertThat(TestApi.json(updated).get("id").asInt()).isEqualTo(id);

        restart();
        assertThat(profiles()).extracting(p -> p.get("name").asText()).containsExactly("IntelliJ IDEA", "Node");
        assertThat(profiles().get(1).get("portFrom").isNull()).isTrue();

        assertThat(api.send("DELETE", BASE + "/profiles/1", null).statusCode()).isEqualTo(200);
        assertThat(api.send("DELETE", BASE + "/profiles/" + id, null).statusCode()).isEqualTo(200);
        restart();
        // CP-02: la lista vacía es la del usuario; el perfil inicial no vuelve.
        assertThat(profiles()).isEmpty();
        // CP-01: los identificadores no se reutilizan.
        assertThat(create(profile("Otro", "otro", null, null))).isEqualTo(3);
    }

    @Test
    void cp02_an_unreadable_file_is_treated_as_missing() throws IOException {
        Files.createDirectories(file().getParent());
        Files.writeString(file(), "{\"nextId\":5,\"profiles\":[{\"id\":1,\"name\":\"Sin nada\"}]}");
        restart();
        assertThat(profiles()).extracting(p -> p.get("name").asText()).containsExactly("IntelliJ IDEA");
        Files.writeString(file(), "esto no es JSON");
        restart();
        assertThat(profiles()).extracting(p -> p.get("name").asText()).containsExactly("IntelliJ IDEA");
    }

    @Test
    void cp03_rejects_each_wrong_value_and_says_the_field() {
        String url = BASE + "/profiles";
        assertInvalid(api.post(url, profile("", "x", null, null).toString()), "name");
        assertInvalid(api.post(url, profile("n".repeat(61), "x", null, null).toString()), "name");
        assertInvalid(api.post(url, profile("A", "(sin cerrar", null, null).toString()), "processPattern");
        assertInvalid(api.post(url, profile("A", "p".repeat(201), null, null).toString()), "processPattern");
        // Coincide con el texto vacío: cerraría todos los procesos.
        assertInvalid(api.post(url, profile("A", ".*", null, null).toString()), "processPattern");
        assertInvalid(api.post(url, profile("A", "idea|", null, null).toString()), "processPattern");
        // Ni patrón ni puertos.
        assertInvalid(api.post(url, profile("A", null, null, null).toString()), "processPattern");
        assertInvalid(api.post(url, profile("A", "x", 0, 10).toString()), "portFrom");
        assertInvalid(api.post(url, profile("A", "x", 1, 65536).toString()), "portTo");
        assertInvalid(api.post(url, profile("A", "x", null, 8080).toString()), "portFrom");
        assertInvalid(api.post(url, profile("A", "x", 8080, null).toString()), "portTo");
        assertInvalid(api.post(url, profile("A", "x", 8090, 8080).toString()), "portTo");
        assertInvalid(api.post(url, "{\"name\":\"A\",\"processPattern\":\"x\",\"portFrom\":\"8080\",\"portTo\":8090}"), "portFrom");
        assertInvalid(api.put(url + "/1", profile("", "x", null, null).toString()), "name");
        assertError(api.post(url, "[]"), 400, "invalid_profile");
        assertError(api.post(url, "{"), 400, "invalid_request");
        assertThat(profiles()).hasSize(1);
        assertThat(file()).doesNotExist();
    }

    @Test
    void cp04_an_unknown_profile_answers_404_and_the_51st_answers_409() {
        assertError(api.put(BASE + "/profiles/99", profile("A", "x", null, null).toString()), 404, "profile_not_found");
        assertError(api.send("DELETE", BASE + "/profiles/99", null), 404, "profile_not_found");
        assertError(api.get(BASE + "/profiles/99/scan"), 404, "profile_not_found");
        assertError(api.get(BASE + "/profiles/abc/scan"), 404, "profile_not_found");
        assertError(api.post(BASE + "/profiles/99/close", "{\"pids\":[1]}"), 404, "profile_not_found");

        for (int i = 2; i <= 50; i++) {
            create(profile("Perfil " + i, "x", null, null));
        }
        assertError(api.post(BASE + "/profiles", profile("De más", "x", null, null).toString()), 409, "too_many_profiles");
        assertThat(profiles()).hasSize(50);
    }

    // --- Búsqueda ---

    @Test
    void cp10_cp11_cp12_cp13_finds_by_pattern_and_by_port_each_process_once_in_pid_order() {
        table.process(900, API).process(100, IDE).process(300, "/usr/bin/python3 servidor.py")
                .process(500, "/usr/bin/java com.example.OtraApi").process(700, "/usr/bin/vim IDEAS.txt")
                // El mismo puerto en IPv4 e IPv6, y un proceso con dos puertos.
                .listen(8081, 900L).listen(8081, 900L).listen(8080, 900L)
                .listen(8085, 500L).listen(8079, 300L).listen(8091, 300L).listen(5432, 300L);

        JsonNode scan = scan(1);
        assertThat(pids(scan)).containsExactly(100L, 500L, 900L);
        JsonNode ide = scan.get("processes").get(0);
        assertThat(ide.get("command").asText()).isEqualTo(IDE);
        assertThat(ide.get("byPattern").asBoolean()).isTrue();
        assertThat(ide.get("ports")).isEmpty();
        JsonNode other = scan.get("processes").get(1);
        assertThat(other.get("byPattern").asBoolean()).isFalse();
        assertThat(longs(other.get("ports"))).containsExactly(8085L);
        JsonNode demo = scan.get("processes").get(2);
        assertThat(demo.get("byPattern").asBoolean()).isTrue();
        assertThat(longs(demo.get("ports"))).containsExactly(8080L, 8081L);
        assertThat(scan.get("blockedPorts")).isEmpty();
        assertThat(scan.get("warning").isNull()).isTrue();
        // CP-10: buscar no cierra nada.
        assertThat(table.killed).isEmpty();
    }

    @Test
    void cp11_the_pattern_is_case_sensitive_and_a_profile_without_ports_does_not_ask_for_them() {
        table.process(100, "/opt/IDEA/bin/launcher").process(200, "/opt/idea/bin/idea").listen(8080, 100L);
        table.listenersFailure = "no debería pedirse";
        int id = create(profile("Solo patrón", "idea", null, null));
        JsonNode scan = scan(id);
        assertThat(pids(scan)).containsExactly(200L);
        assertThat(scan.get("warning").isNull()).isTrue();
    }

    @Test
    void cp13_the_command_is_cut_at_300_characters() {
        table.process(100, "idea " + "x".repeat(400));
        assertThat(scan(1).get("processes").get(0).get("command").asText()).hasSize(300);
    }

    @Test
    void cp14_cajon_de_sastre_never_appears_even_if_it_matches() {
        table.process(FakeProcesses.SELF, "/usr/bin/java -javaagent:/opt/idea/lib/idea_rt.jar dev.cajonsastre.Main")
                .process(100, IDE).listen(8080, FakeProcesses.SELF);
        JsonNode scan = scan(1);
        assertThat(pids(scan)).containsExactly(100L);
        assertThat(scan.get("blockedPorts")).isEmpty();

        JsonNode closed = close(1, "[" + FakeProcesses.SELF + ",100]");
        assertThat(longs(closed.get("gone"))).containsExactly(FakeProcesses.SELF);
        assertThat(table.killed).containsExactly(100L);
    }

    @Test
    void cp15_a_port_of_another_user_is_reported_as_blocked() {
        table.process(100, IDE).blocked(8083).blocked(8082).blocked(9000);
        JsonNode scan = scan(1);
        assertThat(pids(scan)).containsExactly(100L);
        assertThat(longs(scan.get("blockedPorts"))).containsExactly(8082L, 8083L);
    }

    @Test
    void cp15_without_ss_the_pattern_still_works_and_a_warning_says_it() {
        table.process(100, IDE).process(500, "/usr/bin/java com.example.OtraApi").listen(8085, 500L);
        table.listenersFailure = SystemProcesses.SS_MISSING;
        JsonNode scan = scan(1);
        assertThat(pids(scan)).containsExactly(100L);
        assertThat(scan.get("warning").asText())
                .isEqualTo("No se encontró el comando «ss»: no se pueden buscar los procesos de los puertos");
    }

    // --- Cierre ---

    @Test
    void cp20_rejects_a_request_without_a_valid_list_of_pids() {
        table.process(100, IDE);
        String url = BASE + "/profiles/1/close";
        assertError(api.post(url, ""), 400, "invalid_request");
        assertError(api.post(url, "{}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":[]}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":\"100\"}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":[100,\"200\"]}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":[0]}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":[-5]}"), 400, "invalid_request");
        assertError(api.post(url, "{\"pids\":[1.5]}"), 400, "invalid_request");
        StringBuilder many = new StringBuilder("{\"pids\":[1");
        for (int i = 2; i <= 501; i++) {
            many.append(',').append(i);
        }
        assertError(api.post(url, many.append("]}").toString()), 400, "invalid_request");
        assertThat(table.killed).isEmpty();
    }

    @Test
    void cp21_only_closes_what_was_asked_and_is_still_in_the_scan() {
        table.process(100, IDE).process(900, API).process(300, "/usr/bin/python3 servidor.py")
                .process(1, "/sbin/init").listen(8080, 900L);

        // 300 y 1 no son del perfil; 555 no existe; 900 no se pide.
        JsonNode closed = close(1, "[100,300,1,555,100]");
        assertThat(longs(closed.get("closed"))).containsExactly(100L);
        assertThat(longs(closed.get("gone"))).containsExactly(300L, 1L, 555L);
        assertThat(closed.get("failed")).isEmpty();
        assertThat(table.killed).containsExactly(100L);
        assertThat(table.commands).containsKeys(900L, 300L, 1L);
        assertThat(pids(scan(1))).containsExactly(900L);
    }

    @Test
    void cp22_one_that_cannot_be_closed_is_reported_and_does_not_stop_the_rest() {
        table.process(100, IDE).process(900, API).listen(8080, 900L);
        table.immortal.add(100L);
        JsonNode closed = close(1, "[100,900]");
        assertThat(longs(closed.get("closed"))).containsExactly(900L);
        assertThat(closed.get("failed")).hasSize(1);
        assertThat(closed.get("failed").get(0).get("pid").asLong()).isEqualTo(100L);
        assertThat(closed.get("failed").get(0).get("command").asText()).isEqualTo(IDE);
        assertThat(table.killed).containsExactly(100L, 900L);
        // Los puertos quedan libres.
        JsonNode after = scan(1);
        assertThat(pids(after)).containsExactly(100L);
    }
}
