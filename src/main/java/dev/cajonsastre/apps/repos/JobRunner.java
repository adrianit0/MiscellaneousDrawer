package dev.cajonsastre.apps.repos;

import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Console;
import dev.cajonsastre.platform.ConsoleState;
import dev.cajonsastre.platform.Consoles;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * RG-20 a RG-32: los trabajos de git. Uno a la vez, en un hilo propio, con su salida en una consola de la plataforma
 * (RG-28). El último terminado se conserva hasta que empieza otro.
 */
final class JobRunner {

    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);

    /** RG-20: las acciones y su nombre. */
    static final Map<String, String> ACTIONS = Map.of(
            "fetch", "Consultar el remoto",
            "pull", "Actualizar",
            "switch", "Cambiar de rama",
            "discard", "Descartar cambios",
            "set-remote", "Usar el remoto configurado",
            "clone", "Clonar",
            "fetch-all", "Consultar todas",
            "update-all", "Actualizar todas");
    /** RG-23 */
    static final String NOT_CLONED = "El repositorio no está clonado";
    static final String NOT_GIT = "La carpeta no es un repositorio git";
    static final String NOT_EMPTY = "La carpeta ya existe y no está vacía";
    /** RG-24 */
    static final String DETACHED = "El repositorio no está en ninguna rama";

    /** RG-31 */
    record RepoResult(int repoId, String name, String result, String detail) {
    }

    /** RG-31. consoleId: la consola con su salida (RG-28). */
    record JobView(long id, String action, String state, String startedAt, String finishedAt, String message, long consoleId,
                   List<RepoResult> repos) {
    }

    /** Un repositorio que no puede seguir. El mensaje va en español o es la última línea de error de git. */
    private static final class Failed extends Exception {
        Failed(String message) {
            super(message);
        }
    }

    private static final class Job {
        final long id;
        final String action;
        final String branch;
        final List<Repo> targets;
        final boolean multi;
        final Instant startedAt;
        final Console console;
        final List<RepoResult> results = new ArrayList<>();
        volatile String state = "running";
        volatile Instant finishedAt;
        volatile String message;

        Job(long id, String action, String branch, List<Repo> targets, Instant startedAt, Console console) {
            this.id = id;
            this.action = action;
            this.branch = branch;
            this.targets = targets;
            this.multi = action.endsWith("-all");
            this.startedAt = startedAt;
            this.console = console;
            targets.forEach(r -> results.add(new RepoResult(r.id(), r.name(), "pending", null)));
        }
    }

    private final CommandRunner runner;
    private final RepoInspector inspector;
    private final Clock clock;
    private final Notifications notifications;
    private final Consoles consoles;
    private Job current;
    private Thread thread;
    private long ids;

    JobRunner(CommandRunner runner, RepoInspector inspector, Clock clock, Notifications notifications, Consoles consoles) {
        this.runner = runner;
        this.inspector = inspector;
        this.clock = clock;
        this.notifications = notifications;
        this.consoles = consoles;
    }

    synchronized boolean running() {
        return current != null && current.state.equals("running");
    }

    static ApiError jobRunning() {
        return new ApiError(409, "job_running", "Hay un trabajo de git en marcha: espera a que termine o cancélalo");
    }

    // --- Inicio y consulta ---

    /**
     * RG-20: valida e inicia. 409 si ya hay uno en marcha.
     *
     * @param repo el repositorio de una acción de uno solo; null en las de todos
     * @param all  la lista entera, para las acciones de todos
     */
    synchronized JobView start(String action, Repo repo, String branch, List<Repo> all) {
        if (action == null || !ACTIONS.containsKey(action)) {
            throw ApiError.badRequest("invalid_request", "Acción desconocida");
        }
        boolean multi = action.endsWith("-all");
        if (!multi && repo == null) {
            throw ApiError.badRequest("invalid_request", "Falta el repositorio");
        }
        if (action.equals("switch") && !Repo.validBranch(branch)) {
            throw ApiError.badRequest("invalid_request", "El nombre de la rama no es válido");
        }
        if (multi && all.isEmpty()) {
            throw ApiError.badRequest("invalid_request", "No hay ningún repositorio");
        }
        if (running()) {
            throw jobRunning();
        }
        long id = ++ids;
        List<Repo> targets = multi ? List.copyOf(all) : List.of(repo);
        String name = multi ? ACTIONS.get(action) : ACTIONS.get(action) + " · " + repo.name();
        Job job = new Job(id, action, action.equals("switch") ? branch : null, targets, clock.instant(), consoles.open(shorten(name, 80)));
        current = job;
        // S-21, RG-32: al registro del shell solo van identificadores y estados.
        log.info("Trabajo {} de la mini app repos iniciado: {} sobre {}", id, action, targets.stream().map(Repo::id).toList());
        thread = Thread.ofPlatform().daemon().name("cajonsastre-repos-job").start(() -> execute(job));
        return view(job);
    }

    /** RG-31: el trabajo en marcha o el último terminado; null si no hay. */
    synchronized JobView view() {
        return current == null ? null : view(current);
    }

    private static JobView view(Job job) {
        Instant finished = job.finishedAt;
        List<RepoResult> results;
        synchronized (job.results) {
            results = List.copyOf(job.results);
        }
        return new JobView(job.id, job.action, job.state, job.startedAt.truncatedTo(ChronoUnit.SECONDS).toString(),
                finished == null ? null : finished.truncatedTo(ChronoUnit.SECONDS).toString(), job.message, job.console.id(),
                results);
    }

    /** RG-30 */
    synchronized void cancel() {
        if (!running()) {
            throw new ApiError(409, "no_job", "No hay ningún trabajo en marcha");
        }
        thread.interrupt();
    }

    /** RG-30: al apagar se cancela el trabajo y se espera a que suelte sus procesos. */
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
                running.join(5000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    // --- Ejecución ---

    private void execute(Job job) {
        Console console = job.console;
        boolean cancelled = false;
        for (int i = 0; i < job.targets.size() && !cancelled; i++) {
            Repo repo = job.targets.get(i);
            set(job, i, "running", null);
            if (job.multi) {
                console.line("## " + repo.name());
            }
            try {
                if (Thread.interrupted()) {
                    throw new InterruptedException();
                }
                RepoResult result = step(job, repo);
                set(job, i, result.result(), result.detail());
                if (result.detail() != null) {
                    console.line(result.detail());
                }
            } catch (InterruptedException e) {
                cancelled = true;
                set(job, i, "pending", null);
            } catch (Failed | IOException e) {
                String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                set(job, i, "failed", shorten(reason, 300));
                console.line("ERROR: " + reason);
            } catch (RuntimeException e) {
                log.error("Error inesperado en el trabajo {} de la mini app repos", job.id, e);
                set(job, i, "failed", "Error inesperado: " + e.getClass().getSimpleName());
                console.line("ERROR: error inesperado");
            }
            if (job.multi) {
                console.line("");
            }
        }
        // Limpia la interrupción antes de notificar.
        cancelled |= Thread.interrupted();
        List<RepoResult> results;
        synchronized (job.results) {
            results = List.copyOf(job.results);
        }
        long failed = results.stream().filter(r -> r.result().equals("failed")).count();
        String state = cancelled ? "cancelled" : failed > 0 ? "failed" : "succeeded";
        job.message = cancelled ? "Trabajo cancelado" : message(job, results);
        if (cancelled || job.multi) {
            console.line(job.message);
        }
        // RG-28: la consola termina antes de que el trabajo deje de estar en marcha.
        console.finish(switch (state) {
            case "cancelled" -> ConsoleState.CANCELLED;
            case "succeeded" -> ConsoleState.SUCCEEDED;
            default -> ConsoleState.FAILED;
        });
        job.finishedAt = clock.instant();
        job.state = state;
        log.info("Trabajo {} de la mini app repos terminado: {}", job.id, state);
        // RG-29: solo los trabajos largos, y nunca uno cancelado.
        if (!cancelled && (job.multi || job.action.equals("clone"))) {
            if (failed == 0) {
                notifications.send(shorten(job.message, 80), null, NotificationKind.SUCCESS, "/");
            } else if (job.multi) {
                notifications.send(shorten(job.message, 80), null, NotificationKind.ERROR, "/");
            } else {
                notifications.send(shorten("No se ha podido clonar " + results.get(0).name(), 80), results.get(0).detail(),
                        NotificationKind.ERROR, "/");
            }
        }
    }

    /** RG-29, RG-31: el mensaje de un trabajo que ha terminado sin cancelarse. */
    static String message(Job job, List<RepoResult> results) {
        if (!job.multi) {
            RepoResult only = results.get(0);
            if (only.result().equals("failed")) {
                return only.detail();
            }
            if (job.action.equals("clone")) {
                return "Repositorio clonado: " + only.name();
            }
            return switch (only.result()) {
                case "updated" -> "Actualizado";
                case "unchanged" -> "Sin cambios";
                default -> "Hecho";
            };
        }
        return summary(job.action, results.stream().map(RepoResult::result).toList());
    }

    /** RG-29: el resumen de un trabajo de varios repositorios. */
    static String summary(String action, List<String> results) {
        long failed = results.stream().filter("failed"::equals).count();
        if (failed > 0) {
            return failed + " de " + results.size() + (failed == 1 ? " repositorios ha fallado" : " repositorios han fallado");
        }
        long skipped = results.stream().filter("skipped"::equals).count();
        String tail = skipped == 0 ? "" : ", " + skipped + (skipped == 1 ? " omitido" : " omitidos");
        if (action.equals("update-all")) {
            long updated = results.stream().filter("updated"::equals).count();
            long unchanged = results.stream().filter("unchanged"::equals).count();
            return updated + (updated == 1 ? " actualizado, " : " actualizados, ") + unchanged + " sin cambios" + tail;
        }
        long done = results.stream().filter("done"::equals).count();
        return done + (done == 1 ? " consultado" : " consultados") + tail;
    }

    private static String shorten(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private static void set(Job job, int index, String result, String detail) {
        synchronized (job.results) {
            RepoResult old = job.results.get(index);
            job.results.set(index, new RepoResult(old.repoId(), old.name(), result, detail));
        }
    }

    /** RG-22 a RG-27: los comandos de una acción sobre un repositorio. */
    private RepoResult step(Job job, Repo repo) throws Failed, IOException, InterruptedException {
        RepoInspector.Folder folder = RepoInspector.folder(repo);
        if (job.action.equals("clone")) {
            if (folder != RepoInspector.Folder.MISSING) {
                throw new Failed(NOT_EMPTY);
            }
            git(job, Command.git("clone", "--branch", repo.defaultBranch(), "--", repo.remoteUrl(), repo.dir()));
            return done(repo);
        }
        if (folder != RepoInspector.Folder.GIT) {
            String reason = folder == RepoInspector.Folder.MISSING ? NOT_CLONED : NOT_GIT;
            if (job.multi) {
                // RG-27
                return new RepoResult(repo.id(), repo.name(), "skipped", reason);
            }
            throw new Failed(reason);
        }
        switch (job.action) {
            case "fetch", "fetch-all" -> git(job, Command.gitIn(repo.dir(), "fetch", "--prune", "origin"));
            case "pull" -> {
                return pull(job, repo);
            }
            case "update-all" -> {
                git(job, Command.gitIn(repo.dir(), "switch", repo.defaultBranch()));
                return pull(job, repo);
            }
            case "switch" -> {
                // RG-25
                if (!branches(repo).contains(job.branch)) {
                    throw new Failed("La rama «" + job.branch + "» no existe");
                }
                git(job, Command.gitIn(repo.dir(), "switch", job.branch));
            }
            case "discard" -> git(job, Command.gitIn(repo.dir(), "reset", "--hard", "HEAD"));
            case "set-remote" -> git(job, Command.gitIn(repo.dir(), "remote", inspector.origin(repo) == null ? "add" : "set-url",
                    "origin", repo.remoteUrl()));
            default -> throw new IllegalStateException(job.action);
        }
        return done(repo);
    }

    private static RepoResult done(Repo repo) {
        return new RepoResult(repo.id(), repo.name(), "done", null);
    }

    /** RG-24: actualiza la rama actual sin crear nunca un commit de mezcla. */
    private RepoResult pull(Job job, Repo repo) throws Failed, IOException, InterruptedException {
        RepoInspector.Local before = local(repo);
        if (before.branch() == null) {
            throw new Failed(DETACHED);
        }
        git(job, Command.gitIn(repo.dir(), "pull", "--ff-only", "origin", before.branch()));
        RepoInspector.Local after = local(repo);
        boolean updated = after.oid() != null && !after.oid().equals(before.oid());
        return new RepoResult(repo.id(), repo.name(), updated ? "updated" : "unchanged", null);
    }

    private RepoInspector.Local local(Repo repo) throws Failed, IOException, InterruptedException {
        try {
            return inspector.local(repo);
        } catch (RepoInspector.GitFailed e) {
            throw new Failed(e.getMessage());
        }
    }

    private List<String> branches(Repo repo) throws Failed, IOException, InterruptedException {
        try {
            return inspector.branches(repo);
        } catch (RepoInspector.GitFailed e) {
            throw new Failed(e.getMessage());
        }
    }

    /** RG-28: escribe el comando y su salida en la consola; si termina con error, falla con su última línea. */
    private void git(Job job, Command command) throws Failed, IOException, InterruptedException {
        Console console = job.console;
        console.line(command.line());
        String[] last = {null};
        int code = runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                console.line(line);
            }

            @Override
            public void err(String line) {
                console.line(line);
                synchronized (last) {
                    if (!line.isBlank()) {
                        last[0] = line.strip();
                    }
                }
            }
        });
        if (code != 0) {
            synchronized (last) {
                throw new Failed(last[0] != null ? last[0] : "git ha terminado con el código " + code);
            }
        }
    }
}
