package dev.cajonsastre.apps.resubmit;

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
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La mini app por su API, con el servidor real, Bitbucket simulado y sin git (RP-01 a RP-35): no contacta con ningún
 * servidor ni ejecuta comandos. Datos inventados (S-31).
 */
class ResubmitAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/resubmit";

    @TempDir
    Path dir;
    final FakeBitbucket bitbucket = new FakeBitbucket();
    /** Los comandos que se intentan ejecutar: ninguno llega a ejecutarse. */
    final List<Command> commands = new CopyOnWriteArrayList<>();
    final List<String> notifications = new CopyOnWriteArrayList<>();
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
        CommandRunner noGit = (command, output) -> {
            commands.add(command);
            throw new CommandRunner.CommandNotFound(command.program(), null);
        };
        ResubmitApp app = new ResubmitApp(noGit, bitbucket);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(app)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> notifications.add(kind.id() + "|" + title + "|" + path),
                consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    private void shutdown() {
        api.close();
        registry.close();
    }

    private Path file() {
        return dir.resolve("config/apps/resubmit/config.json");
    }

    static ObjectNode config(Path copy) {
        return JSON.createObjectNode().put("baseUrl", FakeBitbucket.BASE + "/").put("token", FakeBitbucket.TOKEN)
                .put("projectKey", FakeBitbucket.PROJECT).put("repoSlug", FakeBitbucket.REPO)
                .put("username", FakeBitbucket.USER).put("dir", copy.toString());
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

    private void assertInvalid(ObjectNode body, String field) {
        HttpResponse<String> r = api.put(BASE + "/config", body.toString());
        assertError(r, 400, "invalid_config");
        assertThat(TestApi.json(r).get("details").get("field").asText()).as(body.toString()).isEqualTo(field);
    }

    private JsonNode finished() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        JsonNode job = TestApi.json(api.get(BASE + "/job")).get("job");
        while (job.get("state").asText().equals("running") && System.nanoTime() < deadline) {
            Thread.sleep(20);
            job = TestApi.json(api.get(BASE + "/job")).get("job");
        }
        return job;
    }

    // --- Conexión ---

    @Test
    void rp01_rp03_rp04_the_connection_starts_empty_and_the_token_never_comes_back() throws IOException {
        JsonNode empty = TestApi.json(api.get(BASE + "/config"));
        assertThat(empty.get("tokenSet").asBoolean()).isFalse();
        assertThat(empty.get("missing")).extracting(JsonNode::asText)
                .containsExactly("baseUrl", "token", "projectKey", "repoSlug", "username", "dir");
        assertThat(file()).doesNotExist();

        JsonNode saved = save(config(dir.resolve("copia")));
        // RP-02: la barra final se quita; RP-03: el token no vuelve.
        assertThat(saved.get("baseUrl").asText()).isEqualTo(FakeBitbucket.BASE);
        assertThat(saved.get("tokenSet").asBoolean()).isTrue();
        assertThat(saved.has("token")).isFalse();
        assertThat(saved.get("missing")).isEmpty();
        assertThat(saved.get("targetBranch").isNull()).isTrue();
        assertThat(TestApi.json(api.get(BASE + "/config")).toString()).doesNotContain(FakeBitbucket.TOKEN);
        if (file().getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file()))).isEqualTo("rw-------");
        }

        // Sin token en el cuerpo, se conserva; vacío, se borra.
        ObjectNode again = config(dir.resolve("copia"));
        again.remove("token");
        again.put("targetBranch", "release").put("branchPrefix", "bugfix/");
        assertThat(save(again).get("tokenSet").asBoolean()).isTrue();
        shutdown();
        boot();
        JsonNode reloaded = TestApi.json(api.get(BASE + "/config"));
        assertThat(reloaded.get("tokenSet").asBoolean()).isTrue();
        assertThat(reloaded.get("targetBranch").asText()).isEqualTo("release");
        assertThat(reloaded.get("branchPrefix").asText()).isEqualTo("bugfix/");
        assertThat(save(again.put("token", "")).get("missing")).extracting(JsonNode::asText).containsExactly("token");
        // RP-02: guardar no contacta con Bitbucket ni ejecuta git.
        assertThat(bitbucket.requests).isEmpty();
        assertThat(commands).isEmpty();
    }

    @Test
    void rp01_a_file_that_cannot_be_read_counts_as_missing() throws IOException {
        Files.createDirectories(file().getParent());
        Files.writeString(file(), "{\"baseUrl\": \"ftp://x\", \"token\": \"t\"}");
        shutdown();
        boot();
        assertThat(TestApi.json(api.get(BASE + "/config")).get("tokenSet").asBoolean()).isFalse();
    }

    @Test
    void rp02_rp07_an_invalid_value_names_its_field() {
        Path copy = dir.resolve("copia");
        assertInvalid(config(copy).put("baseUrl", "http://bitbucket.example.test"), "baseUrl");
        assertInvalid(config(copy).put("baseUrl", "https://usuario:clave@bitbucket.example.test"), "baseUrl");
        assertInvalid(config(copy).put("baseUrl", "https://bitbucket.example.test/?x=1"), "baseUrl");
        assertInvalid(config(copy).put("token", "con espacio"), "token");
        assertInvalid(config(copy).put("projectKey", "PROJ/otro"), "projectKey");
        assertInvalid(config(copy).put("repoSlug", "demo?x"), "repoSlug");
        assertInvalid(config(copy).put("username", "con espacio"), "username");
        assertInvalid(config(copy).put("dir", "relativa/copia"), "dir");
        assertInvalid(config(copy).put("targetBranch", "--force"), "targetBranch");
        assertInvalid(config(copy).put("branchPrefix", "/"), "branchPrefix");
        assertThat(save(config(copy).put("baseUrl", "https://bitbucket.example.test:8443/bitbucket").put("projectKey", "~persona"))
                .get("baseUrl").asText()).isEqualTo("https://bitbucket.example.test:8443/bitbucket");
        assertThat(save(config(copy).put("baseUrl", "http://localhost:7990")).get("baseUrl").asText())
                .isEqualTo("http://localhost:7990");
    }

    @Test
    void rp04_without_a_complete_connection_nothing_contacts_bitbucket_or_runs_git() {
        ObjectNode half = config(dir.resolve("copia"));
        half.remove("username");
        save(half);
        assertError(api.post(BASE + "/connection/test", ""), 409, "not_configured");
        HttpResponse<String> list = api.get(BASE + "/candidates");
        assertError(list, 409, "not_configured");
        assertThat(TestApi.json(list).get("details").get("missing")).extracting(JsonNode::asText).containsExactly("username");
        assertError(api.post(BASE + "/jobs", "{\"prIds\": [1]}"), 409, "not_configured");
        assertThat(bitbucket.requests).isEmpty();
        assertThat(commands).isEmpty();
    }

    @Test
    void rp05_rp06_the_connection_test_reads_the_repository_and_explains_errors() {
        save(config(dir.resolve("copia")));
        HttpResponse<String> ok = api.post(BASE + "/connection/test", "");
        assertThat(ok.statusCode()).as(ok.body()).isEqualTo(200);
        assertThat(TestApi.json(ok).get("repository").asText()).isEqualTo("PROJ/demo");
        FakeBitbucket.Request request = bitbucket.requests.get(0);
        assertThat(request.uri().toString()).isEqualTo(FakeBitbucket.BASE + "/rest/api/1.0/projects/PROJ/repos/demo");
        assertThat(request.headers()).containsEntry("Authorization", "Bearer " + FakeBitbucket.TOKEN)
                .containsEntry("Accept", "application/json");

        Map<Integer, String> messages = Map.of(401, "El token no es válido o ha caducado",
                403, "El token no tiene permiso sobre el repositorio",
                404, "No existe el proyecto o el repositorio",
                500, "Fallo interno inventado");
        messages.forEach((status, message) -> {
            bitbucket.forced = new Transport.Reply(status, "{\"errors\":[{\"message\":\"Fallo interno inventado\"}]}");
            HttpResponse<String> r = api.post(BASE + "/connection/test", "");
            assertError(r, 502, "bitbucket_error");
            assertThat(TestApi.json(r).get("message").asText()).isEqualTo(message);
        });
        bitbucket.forced = null;
        bitbucket.offline = true;
        HttpResponse<String> offline = api.post(BASE + "/connection/test", "");
        assertError(offline, 502, "bitbucket_unreachable");
        assertThat(TestApi.json(offline).get("message").asText()).isEqualTo("No hay contacto con Bitbucket");
    }

    // --- PR pendientes ---

    @Test
    void rp10_rp13_candidates_list_the_declined_prs_of_the_user_page_by_page() {
        save(config(dir.resolve("copia")).put("username", "Persona"));
        Instant now = Instant.now();
        // 60 PR abiertos de otras claves y, en la segunda página, uno rechazado.
        for (int i = 0; i < 60; i++) {
            bitbucket.pullRequests.add(FakeBitbucket.pr(1000 + i, "bug/OTRO-" + i, "OPEN", now.minus(Duration.ofDays(1)), null,
                    "b".repeat(40)));
        }
        bitbucket.pullRequests.add(FakeBitbucket.pr(12, "bug/TICKET-0001", "DECLINED", now.minus(Duration.ofDays(9)),
                now.minus(Duration.ofDays(1)), "c".repeat(40)));
        ObjectNode other = FakeBitbucket.pr(13, "bug/TICKET-0002", "DECLINED", now.minus(Duration.ofDays(9)),
                now.minus(Duration.ofDays(1)), "d".repeat(40));
        ((ObjectNode) other.get("author").get("user")).put("name", "otra").put("slug", "otra");
        bitbucket.pullRequests.add(other);

        HttpResponse<String> r = api.get(BASE + "/candidates");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        JsonNode list = TestApi.json(r).get("candidates");
        assertThat(list).hasSize(1);
        JsonNode one = list.get(0);
        assertThat(one.get("id").asLong()).isEqualTo(12);
        assertThat(one.get("title").asText()).isEqualTo("Corrige el caso 12");
        assertThat(one.get("branch").asText()).isEqualTo("bug/TICKET-0001");
        assertThat(one.get("ticket").asText()).isEqualTo("TICKET-0001");
        assertThat(one.get("newBranch").asText()).isEqualTo("bug/TICKET-0001-2");
        assertThat(one.get("selectable").asBoolean()).isTrue();
        assertThat(one.get("link").asText()).endsWith("/pull-requests/12");
        assertThat(one.get("reviewers")).extracting(JsonNode::asText).containsExactly("revisora");

        // RP-10: la consulta exacta, en dos páginas.
        List<FakeBitbucket.Request> pages = bitbucket.lists();
        assertThat(pages).hasSize(2);
        assertThat(pages.get(0).uri().getPath()).isEqualTo("/rest/api/1.0/projects/PROJ/repos/demo/pull-requests");
        assertThat(pages.get(0).query()).containsEntry("state", "ALL").containsEntry("direction", "INCOMING")
                .containsEntry("at", "refs/heads/hotfix").containsEntry("order", "NEWEST").containsEntry("role.1", "AUTHOR")
                .containsEntry("username.1", "Persona").containsEntry("limit", "50").containsEntry("start", "0");
        assertThat(pages.get(1).query()).containsEntry("start", "50");
        assertThat(commands).isEmpty();
    }

    // --- Trabajo ---

    @Test
    void rp20_a_job_needs_a_list_of_distinct_pr_numbers() {
        save(config(dir.resolve("copia")));
        for (String body : List.of("", "{}", "{\"prIds\": []}", "{\"prIds\": [1, 1]}", "{\"prIds\": [0]}",
                "{\"prIds\": [\"1\"]}", "{\"prIds\": [1.5]}", "[1]")) {
            assertError(api.post(BASE + "/jobs", body), 400, "invalid_request");
        }
        StringBuilder many = new StringBuilder("{\"prIds\": [");
        for (int i = 1; i <= 51; i++) {
            many.append(i == 1 ? "" : ",").append(i);
        }
        assertError(api.post(BASE + "/jobs", many + "]}"), 400, "invalid_request");
        assertError(api.post(BASE + "/job/cancel", ""), 409, "no_job");
        assertThat(TestApi.json(api.get(BASE + "/job")).get("job").isNull()).isTrue();
    }

    @Test
    void rp21_rp32_a_folder_that_is_not_a_repository_fails_before_anything_else() throws Exception {
        Files.createDirectories(dir.resolve("copia"));
        save(config(dir.resolve("copia")));
        HttpResponse<String> r = api.post(BASE + "/jobs", "{\"prIds\": [12]}");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        JsonNode job = finished();
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("message").asText()).isEqualTo("La carpeta no es un repositorio git");
        assertThat(job.get("prs").get(0).get("result").asText()).isEqualTo("pending");
        assertThat(notifications).containsExactly("error|La carpeta no es un repositorio git|/");
        assertThat(commands).isEmpty();
        assertThat(bitbucket.requests).isEmpty();
    }

    @Test
    void rp30_rp31_without_git_the_job_fails_and_says_so_without_the_token() throws Exception {
        Files.createDirectories(dir.resolve("copia/.git"));
        save(config(dir.resolve("copia")));
        assertThat(api.post(BASE + "/jobs", "{\"prIds\": [12]}").statusCode()).isEqualTo(202);
        JsonNode job = finished();
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("message").asText()).isEqualTo("No se encontró el comando «git»");
        List<String> lines = consoles.slice(job.get("consoleId").asLong(), 0).lines();
        assertThat(lines).isNotEmpty().noneMatch(l -> l.contains(FakeBitbucket.TOKEN));
        // RP-30: el entorno de git.
        assertThat(commands.get(0).env()).containsEntry("GIT_TERMINAL_PROMPT", "0");
        assertThat(commands.get(0).defaults()).containsEntry("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");
    }
}
