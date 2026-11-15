package dev.cajonsastre.apps.repos;

import dev.cajonsastre.consoles.ConsoleCenter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * RG-12, RG-13 y RG-22 a RG-26 con el git instalado. El remoto es otra carpeta temporal: no se contacta con ningún
 * servidor. Se omite si no hay git. Datos inventados (S-31).
 */
class RealGitTest {

    @TempDir
    Path dir;
    final ProcessRunner runner = new ProcessRunner();
    final RepoInspector inspector = new RepoInspector(runner);
    final ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
    final List<String> notifications = new ArrayList<>();
    JobRunner jobs;
    Path remote;
    Path author;
    Repo repo;

    @BeforeEach
    void prepare() throws Exception {
        assumeTrue(hasGit(), "git no está instalado");
        jobs = new JobRunner(runner, inspector, Clock.systemUTC(),
                (title, text, kind, path) -> notifications.add(kind.id() + "|" + title), consoles.forApp(ReposApp.MANIFEST));
        remote = dir.resolve("remoto.git");
        author = dir.resolve("autor");
        git(dir, "init", "--bare", "-b", "develop", remote.toString());
        git(dir, "clone", remote.toString(), author.toString());
        commit("uno.txt", "uno");
        git(author, "push", "origin", "HEAD:develop");
        git(author, "push", "origin", "HEAD:hotfix");
        // Un Repo construido a mano: una carpeta no pasaría RG-02 como URL.
        repo = new Repo(1, "api-demo", dir.resolve("copia").toString(), remote.toString(), "develop");
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
    private static void git(Path cwd, String... args) throws Exception {
        List<String> command = new ArrayList<>(List.of("git", "-c", "user.name=Prueba", "-c", "user.email=prueba@example.com",
                "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=develop"));
        command.addAll(List.of(args));
        Process process = new ProcessBuilder(command).directory(cwd.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes());
        assertThat(process.waitFor()).as(String.join(" ", args) + "\n" + output).isZero();
    }

    private void commit(String file, String content) throws Exception {
        Files.writeString(author.resolve(file), content);
        git(author, "add", file);
        git(author, "commit", "-m", "Cambio de prueba");
    }

    private JobRunner.JobView job(String action, String branch) throws InterruptedException {
        jobs.start(action, repo, branch, List.of(repo));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
        while (jobs.running() && System.nanoTime() < deadline) {
            Thread.sleep(20);
        }
        return jobs.view();
    }

    private RepoInspector.StatusView status() throws Exception {
        return inspector.inspect(repo);
    }

    @Test
    void rg12_rg13_rg22_to_rg26_clone_fetch_pull_switch_and_discard_against_a_folder_remote() throws Exception {
        assertThat(status().state()).isEqualTo("missing");
        JobRunner.JobView clone = job("clone", null);
        assertThat(clone.state()).as(String.valueOf(clone.message())).isEqualTo("succeeded");
        RepoInspector.StatusView cloned = status();
        assertThat(cloned.state()).isEqualTo("ok");
        assertThat(cloned.branch()).isEqualTo("develop");
        assertThat(cloned.head()).hasSize(8);
        assertThat(cloned.changes()).isZero();
        assertThat(cloned.ahead()).isZero();
        assertThat(cloned.behind()).isZero();
        assertThat(cloned.branches()).containsExactly("develop", "hotfix");
        assertThat(cloned.remoteMatches()).isTrue();
        assertThat(notifications).containsExactly("success|Repositorio clonado: api-demo");

        // Sin novedades: como el script, «no hay nueva versión».
        assertThat(job("pull", null).repos().get(0).result()).isEqualTo("unchanged");

        // RG-12: los commits pendientes son los de la última consulta.
        commit("dos.txt", "dos");
        git(author, "push", "origin", "HEAD:develop");
        assertThat(status().behind()).isZero();
        assertThat(job("fetch", null).state()).isEqualTo("succeeded");
        assertThat(status().behind()).isEqualTo(1);

        JobRunner.JobView pull = job("pull", null);
        assertThat(pull.repos().get(0).result()).as(String.valueOf(pull.message())).isEqualTo("updated");
        assertThat(Path.of(repo.dir()).resolve("dos.txt")).exists();
        assertThat(status().behind()).isZero();
        assertThat(status().head()).isNotEqualTo(cloned.head());

        // RG-25: una rama que solo está en el remoto.
        assertThat(job("switch", "hotfix").state()).isEqualTo("succeeded");
        assertThat(status().branch()).isEqualTo("hotfix");
        assertThat(Path.of(repo.dir()).resolve("dos.txt")).doesNotExist();
        assertThat(job("switch", "inventada").message()).isEqualTo("La rama «inventada» no existe");

        // RG-26
        Files.writeString(Path.of(repo.dir()).resolve("uno.txt"), "cambiado a mano");
        Files.writeString(Path.of(repo.dir()).resolve("local.txt"), "sin seguimiento");
        assertThat(status().changes()).isEqualTo(1);
        assertThat(status().untracked()).isEqualTo(1);
        assertThat(job("discard", null).state()).isEqualTo("succeeded");
        assertThat(status().changes()).isZero();
        assertThat(Path.of(repo.dir()).resolve("uno.txt")).hasContent("uno");
        assertThat(Path.of(repo.dir()).resolve("local.txt")).exists();
    }

    @Test
    void rg24_a_pull_that_cannot_fast_forward_fails_and_leaves_the_copy_as_it_was() throws Exception {
        assertThat(job("clone", null).state()).isEqualTo("succeeded");
        Path copy = Path.of(repo.dir());
        // Un commit local y otro en el remoto: las ramas divergen.
        Files.writeString(copy.resolve("local.txt"), "local");
        git(copy, "add", "local.txt");
        git(copy, "commit", "-m", "Cambio local de prueba");
        commit("dos.txt", "dos");
        git(author, "push", "origin", "HEAD:develop");
        String before = status().head();

        JobRunner.JobView pull = job("pull", null);
        assertThat(pull.state()).isEqualTo("failed");
        assertThat(status().head()).isEqualTo(before);
        assertThat(status().changes()).isZero();
        assertThat(copy.resolve("dos.txt")).doesNotExist();
    }

    @Test
    void rg14_set_remote_points_origin_to_the_configured_url() throws Exception {
        assertThat(job("clone", null).state()).isEqualTo("succeeded");
        Path other = dir.resolve("otro.git");
        git(dir, "init", "--bare", "-b", "develop", other.toString());
        repo = new Repo(1, "api-demo", repo.dir(), other.toString(), "develop");
        assertThat(status().remoteMatches()).isFalse();
        assertThat(job("set-remote", null).state()).isEqualTo("succeeded");
        assertThat(status().remoteMatches()).isTrue();
    }
}
