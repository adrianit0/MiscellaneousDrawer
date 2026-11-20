package dev.cajonsastre.apps.resubmit;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
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
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * RP-21 a RP-33 con el git instalado y Bitbucket simulado. El remoto es una carpeta temporal con la ruta
 * {@code PROJ/demo.git}: no se contacta con ningún servidor. Se omite si no hay git. Datos inventados (S-31).
 *
 * <p>Historia del remoto: {@code develop} y {@code hotfix} salen de un commit común; las ramas de corrección salen de
 * esa {@code hotfix}; al cerrar la versión, {@code hotfix} se mezcla en {@code develop}, se borra y se crea otra vez
 * desde {@code develop} con un commit más.
 */
class ResubmitGitTest {

    private static final String BASE = "/api/apps/resubmit";

    @TempDir
    Path dir;
    final FakeBitbucket bitbucket = new FakeBitbucket();
    final List<Command> commands = new CopyOnWriteArrayList<>();
    final List<String> notifications = new CopyOnWriteArrayList<>();
    final ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
    ResubmitApp app;
    AppRegistry registry;
    TestApi api;
    Path remote;
    Path author;
    Path copy;
    /** El último commit de cada rama de corrección. */
    String ticket1;
    String ticket2;
    String ticket3;

    @BeforeEach
    void prepare() throws Exception {
        assumeTrue(hasGit(), "git no está instalado");
        remote = dir.resolve("servidor").resolve("PROJ").resolve("demo.git");
        author = dir.resolve("autor");
        copy = dir.resolve("copia");
        Files.createDirectories(remote.getParent());
        git(dir, "init", "--bare", "-b", "develop", remote.toString());
        git(dir, "clone", remote.toString(), author.toString());
        commit("base.txt", "base", "Base");
        git(author, "push", "origin", "HEAD:develop", "HEAD:hotfix");

        // TICKET-0001: dos commits y una mezcla de hotfix con el commit de otra persona.
        git(author, "switch", "-c", "bug/TICKET-0001");
        commit("uno.txt", "uno", "TICKET-0001 primer cambio");
        commit("dos.txt", "dos", "TICKET-0001 segundo cambio");
        git(author, "switch", "-c", "otra", "develop");
        commit("otra.txt", "otra", "Cambio de otra persona");
        git(author, "push", "origin", "HEAD:hotfix");
        git(author, "switch", "bug/TICKET-0001");
        git(author, "merge", "--no-edit", "otra");
        git(author, "push", "origin", "bug/TICKET-0001");
        ticket1 = git(author, "rev-parse", "HEAD").strip();

        // TICKET-0002: cambia base.txt, que la hotfix nueva también cambia.
        git(author, "switch", "-c", "bug/TICKET-0002", "develop");
        commit("base.txt", "corregido en el ticket", "TICKET-0002 cambio");
        git(author, "push", "origin", "bug/TICKET-0002");
        ticket2 = git(author, "rev-parse", "HEAD").strip();

        // TICKET-0003: su commit entró en hotfix antes del cierre.
        git(author, "switch", "-c", "bug/TICKET-0003", "develop");
        commit("tres.txt", "tres", "TICKET-0003 cambio");
        git(author, "push", "origin", "bug/TICKET-0003");
        ticket3 = git(author, "rev-parse", "HEAD").strip();
        git(author, "switch", "otra");
        git(author, "merge", "--no-edit", "bug/TICKET-0003");
        git(author, "push", "origin", "HEAD:hotfix");

        // Cierre de la versión.
        git(author, "fetch", "origin");
        git(author, "switch", "-c", "cierre", "origin/develop");
        git(author, "merge", "--no-edit", "origin/hotfix");
        git(author, "push", "origin", "HEAD:develop", ":hotfix");
        commit("base.txt", "cambiado en la hotfix nueva", "Cambio en la hotfix nueva");
        git(author, "push", "origin", "HEAD:hotfix");

        // La copia del usuario.
        git(dir, "clone", remote.toString(), copy.toString());
        git(copy, "config", "user.name", "Prueba");
        git(copy, "config", "user.email", "prueba@example.com");
        git(copy, "config", "commit.gpgsign", "false");

        boot();
        HttpResponse<String> saved = api.put(BASE + "/config", ResubmitAppTest.config(copy).toString());
        assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);
    }

    @AfterEach
    void stop() {
        if (api != null) {
            api.close();
            registry.close();
        }
    }

    private void boot() {
        ProcessRunner real = new ProcessRunner();
        app = new ResubmitApp((command, output) -> {
            commands.add(command);
            return real.run(command, output);
        }, bitbucket);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(app)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> notifications.add(kind.id() + "|" + title + "|" + path),
                consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    private static boolean hasGit() {
        try {
            return new ProcessBuilder("git", "--version").redirectErrorStream(true).start().waitFor(20, TimeUnit.SECONDS);
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /** git de la propia prueba, para preparar el remoto: no pasa por la mini app. */
    private static String git(Path cwd, String... args) throws Exception {
        List<String> command = new ArrayList<>(List.of("git", "-c", "user.name=Prueba", "-c", "user.email=prueba@example.com",
                "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=develop", "-c", "core.autocrlf=false"));
        command.addAll(List.of(args));
        Process process = new ProcessBuilder(command).directory(cwd.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes());
        assertThat(process.waitFor()).as(String.join(" ", args) + "\n" + output).isZero();
        return output;
    }

    private void commit(String file, String content, String message) throws Exception {
        Files.writeString(author.resolve(file), content);
        git(author, "add", file);
        git(author, "commit", "-m", message);
    }

    /** Las ramas del remoto. */
    private List<String> remoteBranches() throws Exception {
        return git(remote, "for-each-ref", "--format=%(refname:short)", "refs/heads").lines().toList();
    }

    private void declined(long id, String branch, String latest) {
        Instant now = Instant.now();
        bitbucket.pullRequests.add(FakeBitbucket.pr(id, branch, "DECLINED", now.minus(Duration.ofDays(10)),
                now.minus(Duration.ofDays(1)), latest));
    }

    private JsonNode run(String ids) throws InterruptedException {
        HttpResponse<String> r = api.post(BASE + "/jobs", "{\"prIds\": [" + ids + "]}");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        return finished();
    }

    private JsonNode finished() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
        JsonNode job = TestApi.json(api.get(BASE + "/job")).get("job");
        while (job.get("state").asText().equals("running") && System.nanoTime() < deadline) {
            Thread.sleep(20);
            job = TestApi.json(api.get(BASE + "/job")).get("job");
        }
        return job;
    }

    private List<String> lines(JsonNode job) {
        return consoles.slice(job.get("consoleId").asLong(), 0).lines();
    }

    private Path worktrees() {
        return dir.resolve("data/apps/resubmit/worktrees");
    }

    /** RP-25: la copia del usuario sigue en develop, limpia, sin ramas nuevas ni copias aparte. */
    private void assertUserCopyUntouched() throws Exception {
        assertThat(git(copy, "branch", "--show-current").strip()).isEqualTo("develop");
        assertThat(git(copy, "status", "--porcelain")).isBlank();
        assertThat(git(copy, "branch", "--format=%(refname:short)").lines().toList()).containsExactly("develop");
        assertThat(git(copy, "worktree", "list").lines().count()).isEqualTo(1);
        if (Files.exists(worktrees())) {
            try (Stream<Path> left = Files.list(worktrees())) {
                assertThat(left.toList()).isEmpty();
            }
        }
    }

    /** RP-27: lo único que se envía es la rama nueva, sin forzar. */
    private void assertOnlyNewBranchesPushed(List<String> expected) {
        List<List<String>> pushes = commands.stream().map(Command::args).filter(a -> a.contains("push")).toList();
        assertThat(pushes).allSatisfy(a -> {
            assertThat(a.subList(a.indexOf("push"), a.size())).hasSize(3);
            assertThat(a.get(a.indexOf("push") + 1)).isEqualTo("origin");
            assertThat(a.get(a.size() - 1)).startsWith("HEAD:refs/heads/");
        });
        assertThat(pushes).extracting(a -> a.get(a.size() - 1).substring("HEAD:refs/heads/".length()))
                .containsExactlyElementsOf(expected);
        // Solo fetch y push contactan con el remoto.
        assertThat(commands).extracting(c -> c.args().get(3)).allMatch(sub -> List.of("remote", "fetch", "rev-parse",
                "for-each-ref", "cat-file", "rev-list", "worktree", "cherry-pick", "diff", "push").contains(sub));
    }

    @Test
    void rp24_rp25_rp27_rp28_rp34_rp35_a_declined_pr_is_resubmitted_with_its_own_commits_on_the_new_hotfix() throws Exception {
        declined(12, "bug/TICKET-0001", ticket1);
        Logger logger = (Logger) LoggerFactory.getLogger(JobRunner.class);
        ListAppender<ILoggingEvent> logged = new ListAppender<>();
        logged.start();
        logger.addAppender(logged);

        JsonNode job;
        try {
            job = run("12");
        } finally {
            logger.detachAppender(logged);
        }
        // RP-35: al registro del shell solo van números y resultados.
        assertThat(logged.list).extracting(ILoggingEvent::getFormattedMessage).containsExactly(
                "Trabajo 1 de la mini app resubmit iniciado: PR [12]",
                "Trabajo 1 de la mini app resubmit terminado: succeeded [12:created]");
        // RP-34
        assertThat(job.get("id").asLong()).isEqualTo(1);
        assertThat(job.get("startedAt").asText()).isNotBlank();
        assertThat(job.get("finishedAt").asText()).isNotBlank();
        assertThat(job.get("prs").get(0).get("title").asText()).isEqualTo("Corrige el caso 12");
        assertThat(job.get("prs").get(0).get("branch").asText()).isEqualTo("bug/TICKET-0001");
        assertThat(job.get("state").asText()).as(String.join("\n", lines(job))).isEqualTo("succeeded");
        assertThat(job.get("message").asText()).isEqualTo("1 recreado");
        JsonNode pr = job.get("prs").get(0);
        assertThat(pr.get("result").asText()).isEqualTo("created");
        assertThat(pr.get("newBranch").asText()).isEqualTo("bug/TICKET-0001-2");
        assertThat(pr.get("detail").asText()).isEqualTo("2 commits");
        assertThat(pr.get("link").asText()).isEqualTo(FakeBitbucket.BASE + "/projects/PROJ/repos/demo/pull-requests/501");

        // RP-24: solo sus dos commits, en orden y sin la mezcla, sobre la hotfix nueva.
        assertThat(git(remote, "log", "--format=%s", "hotfix..bug/TICKET-0001-2").lines().toList())
                .containsExactly("TICKET-0001 segundo cambio", "TICKET-0001 primer cambio");
        assertThat(git(remote, "merge-base", "--is-ancestor", "hotfix", "bug/TICKET-0001-2")).isEmpty();
        assertThat(git(remote, "show", "bug/TICKET-0001-2:base.txt")).isEqualTo("cambiado en la hotfix nueva");

        // RP-28
        assertThat(bitbucket.creates()).hasSize(1);
        JsonNode body = bitbucket.creates().get(0).json();
        assertThat(body.get("title").asText()).isEqualTo("Corrige el caso 12");
        assertThat(body.get("description").asText()).isEqualTo("Descripción inventada del PR 12\n\nProcede de: "
                + FakeBitbucket.BASE + "/projects/PROJ/repos/demo/pull-requests/12");
        assertThat(body.get("fromRef").get("id").asText()).isEqualTo("refs/heads/bug/TICKET-0001-2");
        assertThat(body.get("toRef").get("id").asText()).isEqualTo("refs/heads/hotfix");
        assertThat(body.get("toRef").get("repository").get("project").get("key").asText()).isEqualTo("PROJ");
        assertThat(body.get("reviewers").get(0).get("user").get("name").asText()).isEqualTo("revisora");

        assertUserCopyUntouched();
        assertOnlyNewBranchesPushed(List.of("bug/TICKET-0001-2"));
        assertThat(notifications).containsExactly("success|1 recreado|/");
        // RP-31, RP-35
        assertThat(lines(job)).contains("## bug/TICKET-0001 → bug/TICKET-0001-2").noneMatch(l -> l.contains(FakeBitbucket.TOKEN));

        // RP-12: una vez reenviado, ya no está pendiente.
        bitbucket.pullRequests.add(0, FakeBitbucket.pr(501, "bug/TICKET-0001-2", "OPEN", Instant.now(), null, "e".repeat(40)));
        assertThat(TestApi.json(api.get(BASE + "/candidates")).get("candidates")).isEmpty();
    }

    @Test
    void rp26_a_conflict_uploads_nothing_and_the_job_goes_on_with_the_next_pr() throws Exception {
        declined(13, "bug/TICKET-0002", ticket2);
        declined(12, "bug/TICKET-0001", ticket1);

        JsonNode job = run("13, 12");
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("message").asText()).isEqualTo("1 recreado, 1 con conflictos");
        JsonNode conflict = job.get("prs").get(0);
        assertThat(conflict.get("result").asText()).isEqualTo("conflict");
        assertThat(conflict.get("detail").asText()).isEqualTo("Conflicto al aplicar " + ticket2.substring(0, 8) + ": base.txt");
        assertThat(conflict.get("link").isNull()).isTrue();
        assertThat(job.get("prs").get(1).get("result").asText()).isEqualTo("created");

        assertThat(remoteBranches()).doesNotContain("bug/TICKET-0002-2").contains("bug/TICKET-0001-2");
        assertThat(bitbucket.creates()).hasSize(1);
        assertUserCopyUntouched();
        assertOnlyNewBranchesPushed(List.of("bug/TICKET-0001-2"));
        assertThat(notifications).containsExactly("error|1 recreado, 1 con conflictos|/");
    }

    @Test
    void rp14_rp22_rp23_rp24_existing_branches_are_skipped_and_merged_changes_are_not_resubmitted() throws Exception {
        // Una rama que ya existe en el remoto, sin PR.
        git(author, "push", "origin", "bug/TICKET-0001:bug/TICKET-0001-2");
        declined(14, "bug/TICKET-0003", ticket3);
        declined(12, "bug/TICKET-0001", ticket1);

        JsonNode job = run("14, 12, 99");
        assertThat(job.get("state").asText()).as(String.join("\n", lines(job))).isEqualTo("succeeded");
        assertThat(job.get("message").asText()).isEqualTo("1 recreado, 2 omitidos");
        JsonNode prs = job.get("prs");
        assertThat(prs.get(0).get("result").asText()).isEqualTo("skipped");
        assertThat(prs.get(0).get("detail").asText()).isEqualTo("Sus cambios ya están en «hotfix»");
        assertThat(prs.get(1).get("newBranch").asText()).isEqualTo("bug/TICKET-0001-3");
        assertThat(prs.get(2).get("result").asText()).isEqualTo("skipped");
        assertThat(prs.get(2).get("detail").asText()).isEqualTo("El PR ya no está pendiente de reenviar");
        assertOnlyNewBranchesPushed(List.of("bug/TICKET-0001-3"));
        assertUserCopyUntouched();
    }

    @Test
    void rp24_rp28_rp29_missing_commits_rejected_reviewers_and_a_failed_creation() throws Exception {
        declined(15, "bug/TICKET-0009", "f".repeat(40));
        declined(12, "bug/TICKET-0001", ticket1);
        declined(13, "bug/TICKET-0002", ticket2);
        // RP-28: el primer intento rechaza a los revisores.
        bitbucket.onCreate = request -> request.json().get("reviewers").isEmpty()
                ? null
                : new Transport.Reply(409, "{\"errors\":[{\"message\":\"La revisora no existe\"}]}");

        JsonNode first = run("15, 12");
        assertThat(first.get("prs").get(0).get("result").asText()).isEqualTo("failed");
        assertThat(first.get("prs").get(0).get("detail").asText()).isEqualTo("Los commits del PR no están en el remoto ni en la copia local");
        JsonNode created = first.get("prs").get(1);
        assertThat(created.get("result").asText()).isEqualTo("created");
        assertThat(created.get("detail").asText()).isEqualTo("2 commits. PR creado sin revisores: La revisora no existe");
        assertThat(bitbucket.creates()).hasSize(2);

        // RP-29: la rama queda subida aunque el PR no se cree.
        bitbucket.onCreate = request -> new Transport.Reply(400, "{\"errors\":[{\"message\":\"Título no válido\"}]}");
        git(author, "fetch", "origin");
        git(author, "switch", "-c", "nuevo", "origin/hotfix");
        commit("cuatro.txt", "cuatro", "TICKET-0004 cambio");
        git(author, "push", "origin", "HEAD:bug/TICKET-0004");
        declined(16, "bug/TICKET-0004", git(author, "rev-parse", "HEAD").strip());
        JsonNode second = run("16");
        assertThat(second.get("prs").get(0).get("result").asText()).isEqualTo("failed");
        assertThat(second.get("prs").get(0).get("detail").asText())
                .isEqualTo("Rama bug/TICKET-0004-2 subida, pero no se pudo crear el PR: Título no válido");
        assertThat(remoteBranches()).contains("bug/TICKET-0004-2");
        assertUserCopyUntouched();
    }

    @Test
    void rp21_a_folder_of_another_repository_fails_without_contacting_anything() throws Exception {
        HttpResponse<String> saved = api.put(BASE + "/config", ResubmitAppTest.config(copy).put("repoSlug", "otro").toString());
        assertThat(saved.statusCode()).isEqualTo(200);
        declined(12, "bug/TICKET-0001", ticket1);
        JsonNode job = run("12");
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("message").asText()).isEqualTo("El remoto «origin» de la carpeta no es el repositorio PROJ/otro");
        assertThat(bitbucket.requests).isEmpty();
        assertThat(commands).extracting(c -> String.join(" ", c.args().subList(3, c.args().size())))
                .containsExactly("remote get-url origin");
        // La URL del remoto no se escribe en la consola.
        assertThat(lines(job)).noneMatch(l -> l.contains("servidor"));
    }

    @Test
    void rp33_cancelling_while_creating_the_pr_cleans_up_and_says_the_branch_was_uploaded() throws Exception {
        declined(12, "bug/TICKET-0001", ticket1);
        CountDownLatch reached = new CountDownLatch(1);
        bitbucket.createReached = reached;
        assertThat(api.post(BASE + "/jobs", "{\"prIds\": [12]}").statusCode()).isEqualTo(202);
        assertThat(reached.await(60, TimeUnit.SECONDS)).isTrue();
        // P-20: ocupada mientras dura.
        assertThat(app.busy()).contains("hay un reenvío de PR en marcha");
        assertThat(api.put(BASE + "/config", ResubmitAppTest.config(copy).toString()).statusCode()).isEqualTo(409);

        assertThat(api.post(BASE + "/job/cancel", "").statusCode()).isEqualTo(200);
        JsonNode job = finished();
        assertThat(job.get("state").asText()).isEqualTo("cancelled");
        assertThat(job.get("message").asText()).isEqualTo("Trabajo cancelado");
        assertThat(job.get("prs").get(0).get("result").asText()).isEqualTo("failed");
        assertThat(job.get("prs").get(0).get("detail").asText())
                .isEqualTo("Rama bug/TICKET-0001-2 subida, pero el trabajo se canceló antes de crear el PR");
        assertThat(app.busy()).isEmpty();
        assertThat(notifications).isEmpty();
        assertUserCopyUntouched();
    }
}
