package dev.cajonsastre.apps.resubmit;

import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Console;
import dev.cajonsastre.platform.ConsoleState;
import dev.cajonsastre.platform.Consoles;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * RP-20 a RP-35: el reenvío de los PR elegidos. Uno a la vez, en un hilo propio, con su salida en una consola de la
 * plataforma (RP-31). El último terminado se conserva hasta que empieza otro.
 */
final class JobRunner {

    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);

    static final String CONSOLE = "Reenviar PR";
    /** RP-21 */
    static final String NOT_GIT = "La carpeta no es un repositorio git";
    /** RP-22 */
    static final String NOT_PENDING = "El PR ya no está pendiente de reenviar";
    /** RP-24 */
    static final String NO_COMMITS = "Los commits del PR no están en el remoto ni en la copia local";
    static final String CANCELLED = "Trabajo cancelado";
    private static final Pattern COMMIT = Pattern.compile("[0-9a-fA-F]{7,64}");
    private static final String REMOTE_REFS = "refs/remotes/origin/";

    /** RP-34 */
    record PrResult(long id, String title, String branch, String newBranch, String result, String detail, String link) {

        PrResult with(String result, String detail) {
            return new PrResult(id, title, branch, newBranch, result, detail, link);
        }
    }

    /** RP-34. consoleId: la consola con su salida (RP-31). */
    record JobView(long id, String state, String startedAt, String finishedAt, String message, long consoleId,
                   List<PrResult> prs) {
    }

    /** Lo que impide seguir, con un mensaje en español o la última línea de error de git. */
    private static final class Failed extends Exception {
        Failed(String message) {
            super(message);
        }
    }

    /** La salida de un comando de git. */
    private record Run(int code, List<String> out, String error) {
        boolean ok() {
            return code == 0;
        }
    }

    private static final class Job {
        final long id;
        final ResubmitConfig config;
        final Instant startedAt;
        final Console console;
        final List<PrResult> results = new ArrayList<>();
        /** RP-14: las ramas que ya existen, en los PR, en el remoto o creadas por este trabajo. */
        final Set<String> known = new HashSet<>();
        volatile String state = "running";
        volatile Instant finishedAt;
        volatile String message;

        Job(long id, ResubmitConfig config, List<Long> prIds, Instant startedAt, Console console) {
            this.id = id;
            this.config = config;
            this.startedAt = startedAt;
            this.console = console;
            prIds.forEach(pr -> results.add(new PrResult(pr, null, null, null, "pending", null, null)));
        }
    }

    private final CommandRunner runner;
    private final Bitbucket bitbucket;
    private final Path worktrees;
    private final Clock clock;
    private final Notifications notifications;
    private final Consoles consoles;
    private Job current;
    private Thread thread;
    private long ids;

    JobRunner(CommandRunner runner, Bitbucket bitbucket, Path worktrees, Clock clock, Notifications notifications,
              Consoles consoles) {
        this.runner = runner;
        this.bitbucket = bitbucket;
        this.worktrees = worktrees;
        this.clock = clock;
        this.notifications = notifications;
        this.consoles = consoles;
    }

    synchronized boolean running() {
        return current != null && current.state.equals("running");
    }

    static ApiError jobRunning() {
        return new ApiError(409, "job_running", "Hay un reenvío de PR en marcha: espera a que termine o cancélalo");
    }

    // --- Inicio y consulta ---

    /** RP-20: inicia el reenvío de esos PR, en ese orden. 409 si ya hay uno en marcha. */
    synchronized JobView start(List<Long> prIds, ResubmitConfig config) {
        if (running()) {
            throw jobRunning();
        }
        long id = ++ids;
        Job job = new Job(id, config, prIds, clock.instant(), consoles.open(CONSOLE));
        current = job;
        // S-21, RP-35: al registro del shell solo van números y estados.
        log.info("Trabajo {} de la mini app resubmit iniciado: PR {}", id, prIds);
        thread = Thread.ofPlatform().daemon().name("cajonsastre-resubmit-job").start(() -> execute(job));
        return view(job);
    }

    /** RP-34: el trabajo en marcha o el último terminado; null si no hay. */
    synchronized JobView view() {
        return current == null ? null : view(current);
    }

    private static JobView view(Job job) {
        Instant finished = job.finishedAt;
        List<PrResult> results;
        synchronized (job.results) {
            results = List.copyOf(job.results);
        }
        return new JobView(job.id, job.state, job.startedAt.truncatedTo(ChronoUnit.SECONDS).toString(),
                finished == null ? null : finished.truncatedTo(ChronoUnit.SECONDS).toString(), job.message, job.console.id(),
                results);
    }

    /** RP-33 */
    synchronized void cancel() {
        if (!running()) {
            throw new ApiError(409, "no_job", "No hay ningún trabajo en marcha");
        }
        thread.interrupt();
    }

    /** RP-33: al apagar se cancela el trabajo y se espera a que suelte sus procesos. */
    void stop() {
        Thread running;
        synchronized (this) {
            if (running()) {
                thread.interrupt();
            }
            running = thread;
        }
        if (running != null) {
            try {
                running.join(10_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // --- Ejecución ---

    private void execute(Job job) {
        Console console = job.console;
        boolean cancelled = false;
        String fatal = null;
        try {
            Map<Long, Candidates.Candidate> pending = prepare(job);
            for (int i = 0; i < job.results.size(); i++) {
                if (Thread.interrupted()) {
                    throw new InterruptedException();
                }
                Candidates.Candidate candidate = pending.get(result(job, i).id());
                if (candidate == null) {
                    continue;
                }
                try {
                    resubmit(job, i, candidate);
                } catch (Failed | IOException e) {
                    String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    set(job, i, result(job, i).with("failed", shorten(reason, 300)));
                    console.line("ERROR: " + reason);
                } catch (ApiError e) {
                    set(job, i, result(job, i).with("failed", shorten(e.getMessage(), 300)));
                    console.line("ERROR: " + e.getMessage());
                } catch (RuntimeException e) {
                    log.error("Error inesperado en el trabajo {} de la mini app resubmit", job.id, e);
                    set(job, i, result(job, i).with("failed", "Error inesperado: " + e.getClass().getSimpleName()));
                    console.line("ERROR: error inesperado");
                }
                console.line("");
            }
        } catch (InterruptedException e) {
            cancelled = true;
        } catch (Failed | IOException e) {
            fatal = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        } catch (ApiError e) {
            fatal = e.getMessage();
        } catch (RuntimeException e) {
            log.error("Error inesperado en el trabajo {} de la mini app resubmit", job.id, e);
            fatal = "Error inesperado: " + e.getClass().getSimpleName();
        }
        // Limpia la interrupción antes de notificar.
        cancelled |= Thread.interrupted();
        List<PrResult> results;
        synchronized (job.results) {
            results = List.copyOf(job.results);
        }
        boolean clean = results.stream().allMatch(r -> r.result().equals("created") || r.result().equals("skipped"));
        String state = cancelled ? "cancelled" : fatal == null && clean ? "succeeded" : "failed";
        job.message = cancelled ? CANCELLED : fatal != null ? fatal : summary(results);
        console.line(fatal != null ? "ERROR: " + job.message : job.message);
        // RP-31: la consola termina antes de que el trabajo deje de estar en marcha.
        console.finish(switch (state) {
            case "cancelled" -> ConsoleState.CANCELLED;
            case "succeeded" -> ConsoleState.SUCCEEDED;
            default -> ConsoleState.FAILED;
        });
        job.finishedAt = clock.instant();
        job.state = state;
        log.info("Trabajo {} de la mini app resubmit terminado: {} {}", job.id, state,
                results.stream().map(r -> r.id() + ":" + r.result()).toList());
        // RP-32: nunca uno cancelado.
        if (!cancelled) {
            notifications.send(shorten(job.message, 80), null,
                    state.equals("succeeded") ? NotificationKind.SUCCESS : NotificationKind.ERROR, "/");
        }
    }

    /** RP-32: cuántos PR hay de cada resultado. */
    static String summary(List<PrResult> results) {
        long created = count(results, "created");
        long conflict = count(results, "conflict");
        long skipped = count(results, "skipped");
        long failed = count(results, "failed");
        StringBuilder out = new StringBuilder().append(created).append(created == 1 ? " recreado" : " recreados");
        if (conflict > 0) {
            out.append(", ").append(conflict).append(" con conflictos");
        }
        if (skipped > 0) {
            out.append(", ").append(skipped).append(skipped == 1 ? " omitido" : " omitidos");
        }
        if (failed > 0) {
            out.append(", ").append(failed).append(" con error");
        }
        return out.toString();
    }

    private static long count(List<PrResult> results, String result) {
        return results.stream().filter(r -> r.result().equals(result)).count();
    }

    /**
     * RP-21 a RP-23: comprueba la carpeta, vuelve a pedir los PR pendientes y consulta el remoto. Devuelve los PR
     * elegidos que se pueden reenviar; los demás quedan omitidos.
     */
    private Map<Long, Candidates.Candidate> prepare(Job job) throws Failed, IOException, InterruptedException {
        ResubmitConfig config = job.config;
        String dir = config.dir();
        Console console = job.console;
        // RP-21
        if (!Files.exists(Path.of(dir).resolve(".git"))) {
            throw new Failed(NOT_GIT);
        }
        // La URL no se escribe: puede llevar una contraseña escrita a mano.
        Run origin = git(job, Command.gitIn(dir, "remote", "get-url", "origin"), false);
        if (!origin.ok() || origin.out().isEmpty()
                || !originMatches(origin.out().get(0), config.projectKey(), config.repoSlug())) {
            throw new Failed("El remoto «origin» de la carpeta no es el repositorio " + config.projectKey() + "/"
                    + config.repoSlug());
        }
        // RP-22
        console.line("Bitbucket: PR de " + config.username() + " contra " + config.target());
        List<PullRequest> prs = bitbucket.pullRequests(config);
        // RP-23
        Run fetch = git(job, Command.gitIn(dir, "fetch", "--prune", "origin"), true);
        if (!fetch.ok()) {
            throw new Failed(fetch.error());
        }
        if (!git(job, Command.gitIn(dir, "rev-parse", "--verify", "--quiet", REMOTE_REFS + config.target()), true).ok()) {
            throw new Failed("La rama «" + config.target() + "» no existe en el remoto");
        }
        Run refs = git(job, Command.gitIn(dir, "for-each-ref", "--format=%(refname)", "refs/remotes/origin"), false);
        if (!refs.ok()) {
            throw new Failed(refs.error());
        }
        List<String> remote = refs.out().stream().filter(r -> r.startsWith(REMOTE_REFS))
                .map(r -> r.substring(REMOTE_REFS.length())).toList();
        job.known.addAll(remote);
        prs.forEach(pr -> job.known.add(pr.branch()));

        List<Candidates.Candidate> candidates = Candidates.of(prs, config.prefix(), clock.instant(), remote);
        Map<Long, Candidates.Candidate> byId = new HashMap<>();
        candidates.forEach(c -> byId.put(c.pr().id(), c));
        Map<Long, Candidates.Candidate> pending = new HashMap<>();
        for (int i = 0; i < job.results.size(); i++) {
            PrResult r = result(job, i);
            Candidates.Candidate c = byId.get(r.id());
            PullRequest pr = c != null ? c.pr() : prs.stream().filter(p -> p.id() == r.id()).findFirst().orElse(null);
            PrResult named = pr == null ? r : new PrResult(r.id(), pr.title(), pr.branch(), null, r.result(), null, null);
            if (c == null || !c.selectable()) {
                set(job, i, named.with("skipped", NOT_PENDING));
                console.line("## PR " + r.id() + ": " + NOT_PENDING);
            } else {
                set(job, i, named);
                pending.put(r.id(), c);
            }
        }
        console.line("");
        return pending;
    }

    /** RP-24 a RP-29: el reenvío de un PR. */
    private void resubmit(Job job, int index, Candidates.Candidate candidate)
            throws Failed, IOException, InterruptedException {
        ResubmitConfig config = job.config;
        String dir = config.dir();
        String target = config.target();
        Console console = job.console;
        PullRequest pr = candidate.pr();
        // RP-14, RP-23: nunca una rama que ya exista.
        String branch = Branches.next(config.prefix(), candidate.ticket(), job.known);
        job.known.add(branch);
        PrResult base = new PrResult(pr.id(), pr.title(), pr.branch(), branch, "running", null, null);
        set(job, index, base);
        console.line("## " + pr.branch() + " → " + branch);

        // RP-24
        String latest = pr.latestCommit();
        if (latest == null || !COMMIT.matcher(latest).matches()
                || !git(job, Command.gitIn(dir, "cat-file", "-e", latest + "^{commit}"), true).ok()) {
            throw new Failed(NO_COMMITS);
        }
        Run list = git(job, Command.gitIn(dir, "rev-list", "--reverse", "--topo-order", "--no-merges", latest, "--not",
                REMOTE_REFS + target), true);
        if (!list.ok()) {
            throw new Failed(list.error());
        }
        List<String> commits = list.out().stream().map(String::strip).filter(s -> !s.isEmpty()).toList();
        if (commits.isEmpty()) {
            String detail = "Sus cambios ya están en «" + target + "»";
            set(job, index, base.with("skipped", detail));
            console.line(detail);
            return;
        }

        // RP-25
        Files.createDirectories(worktrees);
        Path tree = worktrees.resolve(job.id + "-" + pr.id());
        remove(job, dir, tree);
        Run add = git(job, Command.gitIn(dir, "worktree", "add", "--detach", tree.toString(), REMOTE_REFS + target), true);
        if (!add.ok()) {
            remove(job, dir, tree);
            throw new Failed(add.error());
        }
        boolean pushed = false;
        try {
            String wt = tree.toString();
            Run pick = git(job, Command.gitIn(wt, Stream.concat(Stream.of("cherry-pick"), commits.stream()).toArray(String[]::new)),
                    true);
            if (!pick.ok()) {
                // RP-26
                Run unmerged = git(job, Command.gitIn(wt, "diff", "--name-only", "--diff-filter=U"), true);
                Run head = git(job, Command.gitIn(wt, "rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"), true);
                git(job, Command.gitIn(wt, "cherry-pick", "--abort"), true);
                List<String> files = unmerged.ok() ? unmerged.out().stream().filter(s -> !s.isBlank()).toList() : List.of();
                if (files.isEmpty()) {
                    throw new Failed(pick.error());
                }
                String commit = head.ok() && !head.out().isEmpty() ? shorten8(head.out().get(0)) : "?";
                String detail = shorten("Conflicto al aplicar " + commit + ": " + String.join(", ", files), 300);
                set(job, index, base.with("conflict", detail));
                console.line(detail);
                return;
            }
            // RP-27: solo la rama nueva, sin forzar.
            Run push = git(job, Command.gitIn(wt, "push", "origin", "HEAD:refs/heads/" + branch), true);
            if (!push.ok()) {
                throw new Failed(push.error());
            }
            pushed = true;
            // RP-28, RP-29
            console.line("Bitbucket: crear el PR de " + branch + " contra " + target);
            Bitbucket.Created created;
            try {
                created = bitbucket.create(config, pr, branch);
            } catch (ApiError e) {
                throw new Failed("Rama " + branch + " subida, pero no se pudo crear el PR: " + e.getMessage());
            }
            String detail = commits.size() + (commits.size() == 1 ? " commit" : " commits")
                    + (created.warning() == null ? "" : ". " + created.warning());
            set(job, index, new PrResult(pr.id(), pr.title(), pr.branch(), branch, "created", shorten(detail, 300),
                    created.link()));
            console.line("PR creado: " + (created.link() == null ? "#" + created.id() : created.link()));
            if (created.warning() != null) {
                console.line(created.warning());
            }
        } catch (InterruptedException e) {
            // RP-33: un PR a medias vuelve a pendiente, salvo que su rama ya esté subida.
            set(job, index, pushed
                    ? base.with("failed", "Rama " + branch + " subida, pero el trabajo se canceló antes de crear el PR")
                    : base.with("pending", null));
            throw e;
        } finally {
            remove(job, dir, tree);
        }
    }

    /** RP-25, RP-33: elimina la copia aparte aunque el trabajo se esté cancelando. */
    private void remove(Job job, String dir, Path tree) {
        boolean interrupted = Thread.interrupted();
        try {
            if (Files.exists(tree)) {
                try {
                    git(job, Command.gitIn(dir, "worktree", "remove", "--force", tree.toString()), true);
                } catch (IOException e) {
                    log.warn("No se pudo eliminar la copia aparte del trabajo {} con git ({})", job.id, e.getClass().getSimpleName());
                } catch (InterruptedException e) {
                    interrupted = true;
                }
            }
            if (Files.exists(tree)) {
                deleteTree(tree);
            }
            try {
                git(job, Command.gitIn(dir, "worktree", "prune"), true);
            } catch (IOException e) {
                log.warn("No se pudo limpiar la lista de copias del trabajo {} ({})", job.id, e.getClass().getSimpleName());
            } catch (InterruptedException e) {
                interrupted = true;
            }
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private static void deleteTree(Path root) {
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    // En Windows, git deja sus objetos como solo lectura.
                    file.toFile().setWritable(true);
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException e) throws IOException {
                    Files.delete(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("No se pudo borrar una copia aparte de la mini app resubmit ({})", e.getClass().getSimpleName());
        }
    }

    /** RP-21: la ruta de la URL, sin .git ni barra final y sin distinguir mayúsculas, termina en el repositorio. */
    static boolean originMatches(String url, String project, String slug) {
        String u = url.strip().replace('\\', '/').toLowerCase(Locale.ROOT);
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        if (u.endsWith(".git")) {
            u = u.substring(0, u.length() - 4);
        }
        String tail = (project + "/" + slug).toLowerCase(Locale.ROOT);
        return u.endsWith("/" + tail) || u.endsWith(":" + tail);
    }

    private static PrResult result(Job job, int index) {
        synchronized (job.results) {
            return job.results.get(index);
        }
    }

    private static void set(Job job, int index, PrResult result) {
        synchronized (job.results) {
            job.results.set(index, result);
        }
    }

    private static String shorten(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private static String shorten8(String sha) {
        String s = sha.strip();
        return s.length() <= 8 ? s : s.substring(0, 8);
    }

    /**
     * RP-31: escribe el comando y, si echo, su salida en la consola. La salida de error siempre se escribe. El error
     * es la última línea que no es una pista de git.
     */
    private Run git(Job job, Command command, boolean echo) throws IOException, InterruptedException {
        Console console = job.console;
        console.line(command.line());
        List<String> out = new ArrayList<>();
        String[] last = {null};
        int code = runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                if (echo) {
                    console.line(line);
                }
                synchronized (out) {
                    out.add(line);
                }
            }

            @Override
            public void err(String line) {
                console.line(line);
                synchronized (last) {
                    if (!line.isBlank() && !line.startsWith("hint:")) {
                        last[0] = line.strip();
                    }
                }
            }
        });
        synchronized (out) {
            synchronized (last) {
                return new Run(code, List.copyOf(out), last[0] != null ? last[0] : "git ha terminado con el código " + code);
            }
        }
    }
}
