package dev.cajonsastre.apps.repos;

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
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La mini app entera por su API, con el servidor real y git simulado (RG-01 a RG-32, P-20): no contacta con ningún
 * servidor. Datos inventados (S-31).
 */
class ReposAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/repos";
    private static final String URL = "https://git.example.com/demo/";

    @TempDir
    Path dir;
    final FakeGit git = new FakeGit();
    /** RG-29: las notificaciones que emite la mini app, como «tipo|título|texto|subruta». */
    final List<String> notifications = new CopyOnWriteArrayList<>();
    final ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
    ReposApp app;
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        boot();
    }

    @AfterEach
    void stop() {
        git.release.countDown();
        shutdown();
    }

    private void boot() {
        app = new ReposApp(git);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(app)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> notifications.add(kind.id() + "|" + title + "|" + text + "|" + path),
                consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    private void shutdown() {
        api.close();
        registry.close();
    }

    // --- Ayudas ---

    private Path file() {
        return dir.resolve("config/apps/repos/repos.json");
    }

    private Path folder(String name) {
        return dir.resolve("copias").resolve(name);
    }

    private ObjectNode repo(String name) {
        return JSON.createObjectNode().put("name", name).put("dir", folder(name).toString()).put("remoteUrl", URL + name + ".git");
    }

    private int create(ObjectNode body) {
        HttpResponse<String> r = api.post(BASE + "/repos", body.toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return TestApi.json(r).get("id").asInt();
    }

    /** Un repositorio de la lista, ya clonado en el git simulado. */
    private int cloned(String name) throws IOException {
        Files.createDirectories(folder(name).resolve(".git"));
        FakeGit.Copy copy = new FakeGit.Copy();
        copy.origin = URL + name + ".git";
        git.copies.put(folder(name).toString(), copy);
        return create(repo(name));
    }

    private FakeGit.Copy copy(String name) {
        return git.copies.get(folder(name).toString());
    }

    private JsonNode status(int index) {
        return TestApi.json(api.get(BASE + "/status")).get("statuses").get(index);
    }

    private JsonNode current() {
        return TestApi.json(api.get(BASE + "/job")).get("job");
    }

    private JsonNode finished() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        JsonNode job = current();
        while (job.get("state").asText().equals("running") && System.nanoTime() < deadline) {
            Thread.sleep(20);
            job = current();
        }
        return job;
    }

    private JsonNode job(String body) throws InterruptedException {
        HttpResponse<String> r = api.post(BASE + "/jobs", body);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        return finished();
    }

    private JsonNode job(String action, int repoId) throws InterruptedException {
        return job("{\"action\": \"" + action + "\", \"repoId\": " + repoId + "}");
    }

    private List<String> lines(JsonNode job) {
        return consoles.slice(job.get("consoleId").asLong(), 0).lines();
    }

    private static List<String> results(JsonNode job) {
        List<String> out = new ArrayList<>();
        job.get("repos").forEach(r -> out.add(r.get("name").asText() + ":" + r.get("result").asText()));
        return out;
    }

    private String in(String name, String command) {
        return "$ git -C " + folder(name) + " " + command;
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    private static void assertInvalid(HttpResponse<String> r, String field) {
        assertError(r, 400, "invalid_repo");
        assertThat(TestApi.json(r).get("details").get("field").asText()).isEqualTo(field);
    }

    // --- Lista ---

    @Test
    void rg01_rg03_the_list_starts_empty_and_is_saved_privately_with_ids_that_are_not_reused() throws IOException {
        assertThat(TestApi.json(api.get(BASE + "/repos")).get("repos")).isEmpty();
        assertThat(file()).doesNotExist();

        int first = create(repo("api-demo"));
        int second = create(repo("api-otra").put("defaultBranch", "main"));
        assertThat(List.of(first, second)).containsExactly(1, 2);
        JsonNode repos = TestApi.json(api.get(BASE + "/repos")).get("repos");
        assertThat(repos).extracting(r -> r.get("name").asText()).containsExactly("api-demo", "api-otra");
        assertThat(repos.get(0).get("defaultBranch").asText()).isEqualTo("develop");
        assertThat(repos.get(1).get("defaultBranch").asText()).isEqualTo("main");
        if (file().getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file()))).isEqualTo("rw-------");
        }

        assertThat(api.send("DELETE", BASE + "/repos/2", null).statusCode()).isEqualTo(200);
        assertThat(create(repo("api-tercera"))).isEqualTo(3);
        HttpResponse<String> updated = api.put(BASE + "/repos/1", repo("api-renombrada").toString());
        assertThat(TestApi.json(updated).get("name").asText()).isEqualTo("api-renombrada");

        shutdown();
        boot();
        assertThat(TestApi.json(api.get(BASE + "/repos")).get("repos")).extracting(r -> r.get("name").asText())
                .containsExactly("api-renombrada", "api-tercera");
        // RG-02: guardar no ejecuta nada.
        assertThat(git.commands).isEmpty();
    }

    @Test
    void rg01_a_file_that_cannot_be_read_counts_as_missing() throws IOException {
        Files.createDirectories(file().getParent());
        Files.writeString(file(), "{\"nextId\": 5, \"repos\": [{\"id\": 1, \"name\": \"x\", \"dir\": \"relativa\"}]}");
        shutdown();
        boot();
        assertThat(TestApi.json(api.get(BASE + "/repos")).get("repos")).isEmpty();
    }

    @Test
    void rg02_rg05_rg06_a_badly_formatted_value_is_a_400_that_names_its_field() {
        assertInvalid(api.post(BASE + "/repos", repo("x").put("name", "  ").toString()), "name");
        assertInvalid(api.post(BASE + "/repos", repo("x").put("dir", "relativa/api").toString()), "dir");
        for (String url : List.of("http://git.example.com/demo/x.git", "file:///tmp/x", "/tmp/x", "ext::sh -c x",
                "--upload-pack=x", "https://git.example.com/demo/x y.git", "https://")) {
            assertInvalid(api.post(BASE + "/repos", repo("x").put("remoteUrl", url).toString()), "remoteUrl");
        }
        // RG-05
        HttpResponse<String> withPassword = api.post(BASE + "/repos",
                repo("x").put("remoteUrl", "https://usuario:clave-de-prueba@git.example.com/demo/x.git").toString());
        assertInvalid(withPassword, "remoteUrl");
        assertThat(TestApi.json(withPassword).get("message").asText()).contains("no debe llevar contraseña");
        // RG-06
        for (String branch : List.of("--force", "-b", "a..b", "a b", "rama.lock", "rama/", ".oculta", "a//b")) {
            assertInvalid(api.post(BASE + "/repos", repo("x").put("defaultBranch", branch).toString()), "defaultBranch");
        }
        assertThat(TestApi.json(api.get(BASE + "/repos")).get("repos")).isEmpty();

        for (String url : List.of("https://git.example.com/demo/x.git", "https://usuario@git.example.com:8443/demo/x.git",
                "ssh://git@git.example.com/demo/x.git", "git@git.example.com:demo/x.git")) {
            create(repo("x").put("remoteUrl", url).put("defaultBranch", "feature/DEMO-1_x.y"));
        }
    }

    @Test
    void rg03_unknown_ids_are_404_and_the_list_has_a_limit() {
        assertError(api.put(BASE + "/repos/9", repo("x").toString()), 404, "repo_not_found");
        assertError(api.send("DELETE", BASE + "/repos/abc", null), 404, "repo_not_found");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"pull\", \"repoId\": 9}"), 404, "repo_not_found");
        for (int i = 0; i < RepoStore.MAX_REPOS; i++) {
            create(repo("api-" + i));
        }
        assertError(api.post(BASE + "/repos", repo("una-mas").toString()), 409, "too_many_repos");
    }

    // --- Estado ---

    @Test
    void rg10_rg11_rg12_rg13_rg14_reports_the_local_state_of_every_repo_without_touching_the_remote() throws IOException {
        cloned("api-demo");
        create(repo("sin-clonar"));
        create(repo("vacia"));
        Files.createDirectories(folder("vacia"));
        create(repo("no-git"));
        Files.createDirectories(folder("no-git"));
        Files.writeString(folder("no-git").resolve("notas.txt"), "x");
        cloned("rota");
        copy("rota").failOn.put("status", "fatal: bad object HEAD");

        FakeGit.Copy copy = copy("api-demo");
        copy.oid = "abcdef0123456789abcdef0123456789abcdef01";
        copy.ahead = 1;
        copy.behind = 4;
        copy.changes = 2;
        copy.untracked = 3;
        copy.local.add("feature/demo");

        JsonNode statuses = TestApi.json(api.get(BASE + "/status")).get("statuses");
        assertThat(statuses).extracting(s -> s.get("state").asText()).containsExactly("ok", "missing", "missing", "not_git", "error");
        JsonNode ok = statuses.get(0);
        assertThat(ok.get("id").asInt()).isEqualTo(1);
        assertThat(ok.get("branch").asText()).isEqualTo("develop");
        assertThat(ok.get("head").asText()).isEqualTo("abcdef01");
        assertThat(ok.get("changes").asInt()).isEqualTo(2);
        assertThat(ok.get("untracked").asInt()).isEqualTo(3);
        assertThat(ok.get("ahead").asInt()).isEqualTo(1);
        assertThat(ok.get("behind").asInt()).isEqualTo(4);
        assertThat(ok.get("branches")).extracting(JsonNode::asText).containsExactly("develop", "feature/demo", "hotfix");
        assertThat(ok.get("remoteMatches").asBoolean()).isTrue();
        assertThat(statuses.get(4).get("error").asText()).isEqualTo("fatal: bad object HEAD");
        assertThat(TestApi.json(api.get(BASE + "/status")).get("warning").isNull()).isTrue();

        // RG-10: solo comandos locales.
        assertThat(git.actions()).isEmpty();
        assertThat(git.commands.get(0).args()).containsExactly("git", "-C", folder("api-demo").toString(), "status",
                "--porcelain=v2", "--branch");
        assertThat(git.commands.get(1).args()).containsExactly("git", "-C", folder("api-demo").toString(), "for-each-ref",
                "--format=%(refname)", "refs/heads", "refs/remotes/origin");
        assertThat(git.commands.get(2).args()).containsExactly("git", "-C", folder("api-demo").toString(), "remote", "get-url",
                "origin");
    }

    @Test
    void rg12_rg14_a_detached_head_has_no_branch_and_another_origin_does_not_match_and_never_leaves_the_server() throws IOException {
        cloned("api-demo");
        FakeGit.Copy copy = copy("api-demo");
        copy.branch = null;
        copy.origin = "https://usuario:clave-de-prueba@git.example.com/otro/api-demo.git";
        HttpResponse<String> r = api.get(BASE + "/status");
        JsonNode status = TestApi.json(r).get("statuses").get(0);
        assertThat(status.get("branch").isNull()).isTrue();
        assertThat(status.get("ahead").isNull()).isTrue();
        assertThat(status.get("behind").isNull()).isTrue();
        assertThat(status.get("remoteMatches").asBoolean()).isFalse();
        assertThat(r.body()).doesNotContain("clave-de-prueba").doesNotContain("otro/api-demo");

        copy.origin = null;
        assertThat(status(0).get("remoteMatches").asBoolean()).isFalse();
        // La misma URL sin «.git» es la misma.
        copy.origin = URL + "api-demo";
        assertThat(status(0).get("remoteMatches").asBoolean()).isTrue();
    }

    @Test
    void rg15_rg21_without_git_the_status_warns_and_a_job_fails_saying_so() throws Exception {
        create(repo("sin-clonar"));
        int id = cloned("api-demo");
        git.missing = true;
        JsonNode body = TestApi.json(api.get(BASE + "/status"));
        assertThat(body.get("warning").asText()).isEqualTo("No se encontró el comando «git»");
        assertThat(body.get("statuses")).extracting(s -> s.get("state").asText()).containsExactly("error", "error");

        JsonNode job = job("fetch", id);
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("message").asText()).isEqualTo("No se encontró el comando «git»");
    }

    // --- Trabajos ---

    @Test
    void rg20_rg21_rg22_every_action_runs_its_commands_with_the_git_environment_and_none_pushes() throws Exception {
        int id = cloned("api-demo");
        int missing = create(repo("api-nueva").put("defaultBranch", "main"));
        copy("api-demo").origin = "https://git.example.com/antiguo/api-demo.git";
        String at = "-C " + folder("api-demo") + " ";

        assertThat(job("fetch", id).get("state").asText()).isEqualTo("succeeded");
        assertThat(job("pull", id).get("state").asText()).isEqualTo("succeeded");
        assertThat(job("{\"action\": \"switch\", \"repoId\": " + id + ", \"branch\": \"hotfix\"}").get("state").asText())
                .isEqualTo("succeeded");
        assertThat(job("discard", id).get("state").asText()).isEqualTo("succeeded");
        assertThat(job("set-remote", id).get("state").asText()).isEqualTo("succeeded");
        copy("api-demo").origin = null;
        assertThat(job("set-remote", id).get("state").asText()).isEqualTo("succeeded");
        assertThat(job("clone", missing).get("state").asText()).isEqualTo("succeeded");

        assertThat(git.actions()).containsExactly(
                "fetch --prune origin",
                "pull --ff-only origin develop",
                "switch hotfix",
                "reset --hard HEAD",
                "remote set-url origin " + URL + "api-demo.git",
                "remote add origin " + URL + "api-demo.git",
                "clone --branch main -- " + URL + "api-nueva.git " + folder("api-nueva"));
        assertThat(git.commands).allSatisfy(c -> {
            assertThat(c.args().get(0)).isEqualTo("git");
            // RG-22
            assertThat(c.args()).doesNotContain("push");
            // RG-21
            assertThat(c.env()).containsEntry("GIT_TERMINAL_PROMPT", "0");
            assertThat(c.defaults()).containsEntry("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");
        });
        assertThat(git.commands.stream().filter(c -> c.args().contains("pull")).findFirst().orElseThrow().args())
                .containsExactly("git", "-C", folder("api-demo").toString(), "pull", "--ff-only", "origin", "develop");
        assertThat(copy("api-demo").origin).isEqualTo(URL + "api-demo.git");
        assertThat(copy("api-nueva").branch).isEqualTo("main");
        assertThat(lines(current())).contains("$ git clone --branch main -- " + URL + "api-nueva.git " + folder("api-nueva"));
        assertThat(at).isNotEmpty();
    }

    @Test
    void rg20_bad_requests_start_nothing() throws IOException {
        int id = cloned("api-demo");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"push\", \"repoId\": " + id + "}"), 400, "invalid_request");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"pull\"}"), 400, "invalid_request");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"pull\", \"repoId\": \"1\"}"), 400, "invalid_request");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"switch\", \"repoId\": " + id + "}"), 400, "invalid_request");
        assertError(api.post(BASE + "/jobs", "{\"action\": \"switch\", \"repoId\": " + id + ", \"branch\": \"--detach\"}"), 400,
                "invalid_request");
        assertError(api.post(BASE + "/jobs", "no es json"), 400, "invalid_request");
        assertThat(current().isNull()).isTrue();
        assertThat(git.commands).isEmpty();
        assertThat(consoles.list()).isEmpty();
    }

    @Test
    void rg20_update_all_without_repos_is_a_400() {
        assertError(api.post(BASE + "/jobs", "{\"action\": \"update-all\"}"), 400, "invalid_request");
    }

    @Test
    void rg23_a_repo_that_is_not_in_the_state_the_action_needs_fails_without_running_anything() throws Exception {
        int missing = create(repo("sin-clonar"));
        int notGit = create(repo("no-git"));
        Files.createDirectories(folder("no-git"));
        Files.writeString(folder("no-git").resolve("notas.txt"), "x");
        int ok = cloned("api-demo");

        JsonNode pull = job("pull", missing);
        assertThat(pull.get("state").asText()).isEqualTo("failed");
        assertThat(pull.get("message").asText()).isEqualTo("El repositorio no está clonado");
        assertThat(job("fetch", notGit).get("message").asText()).isEqualTo("La carpeta no es un repositorio git");
        assertThat(job("clone", notGit).get("message").asText()).isEqualTo("La carpeta ya existe y no está vacía");
        assertThat(job("clone", ok).get("message").asText()).isEqualTo("La carpeta ya existe y no está vacía");
        assertThat(git.commands).isEmpty();
        // RG-29: el clonado fallido avisa; los inmediatos, no.
        assertThat(notifications).containsExactly("error|No se ha podido clonar no-git|La carpeta ya existe y no está vacía|/",
                "error|No se ha podido clonar api-demo|La carpeta ya existe y no está vacía|/");
    }

    @Test
    void rg24_pull_says_updated_when_the_commit_changes_and_unchanged_when_it_does_not() throws Exception {
        int id = cloned("api-demo");
        copy("api-demo").incoming = "2222222222222222222222222222222222222222";
        JsonNode updated = job("pull", id);
        assertThat(results(updated)).containsExactly("api-demo:updated");
        assertThat(updated.get("message").asText()).isEqualTo("Actualizado");
        JsonNode unchanged = job("pull", id);
        assertThat(results(unchanged)).containsExactly("api-demo:unchanged");
        assertThat(unchanged.get("message").asText()).isEqualTo("Sin cambios");
        assertThat(lines(unchanged)).containsExactly(in("api-demo", "pull --ff-only origin develop"), "Already up to date.");
        assertThat(consoles.list()).extracting(c -> c.name()).contains("Actualizar · api-demo");
        // RG-29
        assertThat(notifications).isEmpty();
    }

    @Test
    void rg24_pull_updates_the_current_branch_and_fails_on_a_detached_head_or_when_git_fails() throws Exception {
        int id = cloned("api-demo");
        copy("api-demo").branch = "hotfix";
        job("pull", id);
        assertThat(git.actions()).containsExactly("pull --ff-only origin hotfix");

        copy("api-demo").branch = null;
        JsonNode detached = job("pull", id);
        assertThat(detached.get("state").asText()).isEqualTo("failed");
        assertThat(detached.get("message").asText()).isEqualTo("El repositorio no está en ninguna rama");
        assertThat(git.actions()).hasSize(1);

        copy("api-demo").branch = "develop";
        copy("api-demo").failOn.put("pull", "fatal: Not possible to fast-forward, aborting.");
        JsonNode failed = job("pull", id);
        assertThat(failed.get("state").asText()).isEqualTo("failed");
        assertThat(failed.get("message").asText()).isEqualTo("fatal: Not possible to fast-forward, aborting.");
        assertThat(lines(failed)).contains("fatal: Not possible to fast-forward, aborting.",
                "ERROR: fatal: Not possible to fast-forward, aborting.");
        assertThat(consoles.list().get(0).state()).isEqualTo("failed");
    }

    @Test
    void rg25_switch_requires_a_known_branch() throws Exception {
        int id = cloned("api-demo");
        JsonNode unknown = job("{\"action\": \"switch\", \"repoId\": " + id + ", \"branch\": \"inventada\"}");
        assertThat(unknown.get("state").asText()).isEqualTo("failed");
        assertThat(unknown.get("message").asText()).isEqualTo("La rama «inventada» no existe");
        assertThat(git.actions()).isEmpty();

        JsonNode done = job("{\"action\": \"switch\", \"repoId\": " + id + ", \"branch\": \"hotfix\"}");
        assertThat(results(done)).containsExactly("api-demo:done");
        assertThat(done.get("message").asText()).isEqualTo("Hecho");
        assertThat(status(0).get("branch").asText()).isEqualTo("hotfix");
    }

    @Test
    void rg26_discard_resets_the_tracked_files_and_leaves_the_untracked_ones() throws Exception {
        int id = cloned("api-demo");
        copy("api-demo").changes = 2;
        copy("api-demo").untracked = 1;
        job("discard", id);
        assertThat(git.actions()).containsExactly("reset --hard HEAD");
        assertThat(status(0).get("changes").asInt()).isZero();
        assertThat(status(0).get("untracked").asInt()).isEqualTo(1);
    }

    @Test
    void rg27_rg28_rg29_update_all_goes_back_to_the_default_branch_and_goes_on_when_one_fails() throws Exception {
        cloned("api-uno");
        cloned("api-rota");
        create(repo("sin-clonar"));
        cloned("api-tres");
        api.put(BASE + "/repos/4", repo("api-tres").put("defaultBranch", "hotfix").toString());
        copy("api-uno").branch = "hotfix";
        copy("api-uno").incoming = "2222222222222222222222222222222222222222";
        copy("api-rota").failOn.put("pull", "fatal: unable to access 'https://git.example.com/demo/api-rota.git/'");

        JsonNode job = job("{\"action\": \"update-all\"}");
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(results(job)).containsExactly("api-uno:updated", "api-rota:failed", "sin-clonar:skipped", "api-tres:unchanged");
        assertThat(job.get("repos").get(1).get("detail").asText()).startsWith("fatal: unable to access");
        assertThat(job.get("repos").get(2).get("detail").asText()).isEqualTo("El repositorio no está clonado");
        assertThat(job.get("message").asText()).isEqualTo("1 de 4 repositorios ha fallado");
        assertThat(git.actions()).containsExactly("switch develop", "pull --ff-only origin develop", "switch develop",
                "pull --ff-only origin develop", "switch hotfix", "pull --ff-only origin hotfix");
        assertThat(copy("api-uno").branch).isEqualTo("develop");

        assertThat(consoles.list().get(0).name()).isEqualTo("Actualizar todas");
        assertThat(consoles.list().get(0).state()).isEqualTo("failed");
        assertThat(lines(job)).contains("## api-uno", in("api-uno", "switch develop"), "## api-rota", "## sin-clonar",
                "El repositorio no está clonado", "## api-tres", "1 de 4 repositorios ha fallado");
        assertThat(notifications).containsExactly("error|1 de 4 repositorios ha fallado|null|/");
    }

    @Test
    void rg27_rg29_a_clean_update_all_and_fetch_all_notify_their_summary() throws Exception {
        cloned("api-uno");
        cloned("api-dos");
        create(repo("sin-clonar"));
        copy("api-dos").incoming = "2222222222222222222222222222222222222222";

        JsonNode fetch = job("{\"action\": \"fetch-all\"}");
        assertThat(fetch.get("state").asText()).isEqualTo("succeeded");
        assertThat(results(fetch)).containsExactly("api-uno:done", "api-dos:done", "sin-clonar:skipped");
        assertThat(status(1).get("behind").asInt()).isEqualTo(1);

        JsonNode update = job("{\"action\": \"update-all\"}");
        assertThat(update.get("state").asText()).isEqualTo("succeeded");
        assertThat(consoles.list().get(0).state()).isEqualTo("succeeded");
        assertThat(notifications).containsExactly("success|2 consultados, 1 omitido|null|/",
                "success|1 actualizado, 1 sin cambios, 1 omitido|null|/");
        assertThat(JobRunner.summary("update-all", List.of("updated", "updated", "unchanged"))).isEqualTo("2 actualizados, 1 sin cambios");
        assertThat(JobRunner.summary("fetch-all", List.of("done", "failed", "failed"))).isEqualTo("2 de 3 repositorios han fallado");
    }

    @Test
    void rg29_a_clone_notifies_when_it_ends() throws Exception {
        int id = create(repo("api-nueva"));
        JsonNode job = job("clone", id);
        assertThat(job.get("message").asText()).isEqualTo("Repositorio clonado: api-nueva");
        assertThat(notifications).containsExactly("success|Repositorio clonado: api-nueva|null|/");
        assertThat(status(0).get("state").asText()).isEqualTo("ok");
    }

    @Test
    void rg04_rg20_rg30_p20_one_job_at_a_time_that_can_be_cancelled_and_keeps_the_app_busy() throws Exception {
        int first = cloned("api-uno");
        cloned("api-dos");
        cloned("api-tres");
        git.blocking = "api-dos";
        assertThat(api.post(BASE + "/jobs", "{\"action\": \"fetch-all\"}").statusCode()).isEqualTo(202);
        assertThat(git.blocked.await(10, TimeUnit.SECONDS)).isTrue();

        assertError(api.post(BASE + "/jobs", "{\"action\": \"pull\", \"repoId\": " + first + "}"), 409, "job_running");
        // RG-04
        assertError(api.post(BASE + "/repos", repo("otra").toString()), 409, "job_running");
        assertError(api.put(BASE + "/repos/" + first, repo("api-uno").toString()), 409, "job_running");
        assertError(api.send("DELETE", BASE + "/repos/" + first, null), 409, "job_running");
        assertThat(app.busy()).contains("hay un trabajo de git en marcha");
        assertThat(results(current())).containsExactly("api-uno:done", "api-dos:running", "api-tres:pending");
        assertThat(consoles.list().get(0).state()).isEqualTo("running");

        assertThat(api.post(BASE + "/job/cancel", null).statusCode()).isEqualTo(200);
        JsonNode job = finished();
        assertThat(job.get("state").asText()).isEqualTo("cancelled");
        assertThat(job.get("message").asText()).isEqualTo("Trabajo cancelado");
        assertThat(results(job)).containsExactly("api-uno:done", "api-dos:pending", "api-tres:pending");
        assertThat(consoles.list().get(0).state()).isEqualTo("cancelled");
        assertThat(notifications).isEmpty();
        assertThat(app.busy()).isEmpty();
        assertError(api.post(BASE + "/job/cancel", null), 409, "no_job");
    }

    @Test
    void rg30_stopping_the_app_cancels_the_job() throws Exception {
        int id = cloned("api-demo");
        git.blocking = "api-demo";
        assertThat(api.post(BASE + "/jobs", "{\"action\": \"pull\", \"repoId\": " + id + "}").statusCode()).isEqualTo(202);
        assertThat(git.blocked.await(10, TimeUnit.SECONDS)).isTrue();
        app.stop();
        assertThat(app.busy()).isEmpty();
        assertThat(consoles.list().get(0).state()).isEqualTo("cancelled");
    }

    @Test
    void rg31_without_jobs_there_is_nothing_and_a_new_job_replaces_the_last_one() throws Exception {
        assertThat(current().isNull()).isTrue();
        assertError(api.post(BASE + "/job/cancel", null), 409, "no_job");
        int id = cloned("api-demo");
        JsonNode first = job("fetch", id);
        assertThat(first.get("id").asLong()).isEqualTo(1);
        assertThat(first.get("action").asText()).isEqualTo("fetch");
        assertThat(first.get("startedAt").asText()).isNotEmpty();
        assertThat(first.get("finishedAt").asText()).isNotEmpty();
        assertThat(first.get("repos").get(0).get("repoId").asInt()).isEqualTo(id);
        JsonNode second = job("pull", id);
        assertThat(second.get("id").asLong()).isEqualTo(2);
        assertThat(second.get("consoleId").asLong()).isNotEqualTo(first.get("consoleId").asLong());
    }
}
