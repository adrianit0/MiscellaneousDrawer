package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * BD-10 a BD-18: los trabajos. Uno a la vez, en un hilo propio, con sus pasos, su progreso y su registro en memoria.
 * El último terminado se conserva hasta que empieza otro.
 */
final class JobRunner {

    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);
    /** BD-17 */
    static final String SUCCEEDED = "El trabajo ha terminado correctamente";
    static final String FAILED = "El trabajo ha terminado con errores";

    /** Cuerpo de POST /job. Un paso null no se ejecuta. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Request(String branch, Download download, @JsonProperty("import") Import importStep, Scripts scripts) {

        @JsonIgnoreProperties(ignoreUnknown = true)
        record Download(String mode, Boolean force) {
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        record Import(String dump) {
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        record Scripts(String version, List<String> files) {
        }
    }

    /** BD-13 */
    record View(long id, String state, String branch, String startedAt, String finishedAt, List<StepView> steps, JobLog.Slice log) {
    }

    record StepView(String kind, String state, String message, ProgressView progress, List<SqlScripts.Result> scripts) {
    }

    record ProgressView(long done, long total) {
    }

    /** Un trabajo ya validado. */
    private record Plan(DatabaseConfig config, List<Branch> branches, boolean chunked, boolean force, String importDump,
                        Path scriptsFolder, List<String> scriptFiles) {
    }

    private static final class Job {
        final long id;
        final String branch;
        final Instant startedAt;
        final List<Step> steps = new ArrayList<>();
        final JobLog log = new JobLog();
        volatile String state = "running";
        volatile Instant finishedAt;
        volatile boolean cancelRequested;

        Job(long id, String branch, Instant startedAt) {
            this.id = id;
            this.branch = branch;
            this.startedAt = startedAt;
        }
    }

    private static final class Step implements Reporter {
        final String kind;
        final JobLog log;
        /** Solo en el paso de scripts (BD-52). */
        final List<SqlScripts.Result> scripts;
        String state = "pending";
        String message;
        long done;
        long total;

        Step(String kind, JobLog log, List<SqlScripts.Result> scripts) {
            this.kind = kind;
            this.log = log;
            this.scripts = scripts;
        }

        @Override
        public void log(String line) {
            log.add(line);
        }

        @Override
        public synchronized void message(String text) {
            message = text;
        }

        @Override
        public synchronized void progress(long done, long total) {
            this.done = done;
            this.total = total;
        }

        synchronized void state(String state) {
            this.state = state;
        }

        synchronized void script(int index, SqlScripts.Result result) {
            scripts.set(index, result);
        }

        synchronized StepView view() {
            return new StepView(kind, state, message, total > 0 ? new ProgressView(done, total) : null,
                    scripts == null ? null : List.copyOf(scripts));
        }
    }

    private final ConfigStore configs;
    private final CommandRunner runner;
    private final Sleeper sleeper;
    private final ZoneId zone;
    private final Clock clock;
    private final Notifications notifications;
    private Job current;
    private Thread thread;
    private long ids;

    JobRunner(ConfigStore configs, CommandRunner runner, Sleeper sleeper, ZoneId zone, Clock clock,
              Notifications notifications) {
        this.configs = configs;
        this.runner = runner;
        this.sleeper = sleeper;
        this.zone = zone;
        this.clock = clock;
        this.notifications = notifications;
    }

    synchronized boolean running() {
        return current != null && current.state.equals("running");
    }

    /** BD-10: valida e inicia. 409 si ya hay un trabajo en marcha. */
    synchronized View start(Request request) throws IOException {
        if (running()) {
            throw jobRunning();
        }
        Plan plan = plan(request);
        Job job = new Job(++ids, request.branch(), clock.instant());
        if (!plan.branches().isEmpty() && request.download() != null) {
            job.steps.add(new Step("download", job.log, null));
        }
        if (plan.importDump() != null) {
            job.steps.add(new Step("import", job.log, null));
        }
        if (plan.scriptFiles() != null) {
            List<SqlScripts.Result> scripts = new ArrayList<>();
            plan.scriptFiles().forEach(f -> scripts.add(new SqlScripts.Result(f, "pending", null)));
            job.steps.add(new Step("scripts", job.log, scripts));
        }
        current = job;
        // S-21: al registro del shell solo van identificadores y estados.
        log.info("Trabajo {} de la mini app database iniciado", job.id);
        thread = Thread.ofPlatform().daemon().name("cajonsastre-database-job").start(() -> execute(job, plan));
        return view(job, 0);
    }

    static ApiError jobRunning() {
        return new ApiError(409, "job_running", "Hay un trabajo en marcha: espera a que termine o cancélalo");
    }

    /** BD-13, BD-14: el trabajo en marcha o el último terminado, con las líneas del registro desde after; null si no hay. */
    synchronized View view(long after) {
        return current == null ? null : view(current, after);
    }

    private static View view(Job job, long after) {
        Instant finished = job.finishedAt;
        return new View(job.id, job.state, job.branch, job.startedAt.truncatedTo(ChronoUnit.SECONDS).toString(),
                finished == null ? null : finished.truncatedTo(ChronoUnit.SECONDS).toString(),
                job.steps.stream().map(Step::view).toList(), job.log.after(after));
    }

    /** BD-15 */
    synchronized void cancel() {
        if (!running()) {
            throw new ApiError(409, "no_job", "No hay ningún trabajo en marcha");
        }
        current.cancelRequested = true;
        thread.interrupt();
    }

    /** BD-18: al apagar se cancela el trabajo y se espera a que suelte sus procesos. */
    void stop() {
        Thread running;
        synchronized (this) {
            if (running()) {
                current.cancelRequested = true;
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

    // --- Validación (BD-03, BD-10, BD-11, BD-37, BD-53) ---

    private Plan plan(Request request) throws IOException {
        if (request == null || request.branch() == null) {
            throw invalid("Falta la rama del trabajo");
        }
        boolean both = request.branch().equals("both");
        Branch branch = both ? null : Branch.of(request.branch())
                .orElseThrow(() -> invalid("La rama debe ser develop, hotfix o both"));
        boolean download = request.download() != null;
        boolean imports = request.importStep() != null;
        boolean scripts = request.scripts() != null;
        if (!download && !imports && !scripts) {
            throw invalid("El trabajo no tiene ningún paso");
        }
        if (both && (imports || scripts)) {
            throw invalid("Con «Ambas» solo se puede descargar");
        }
        DatabaseConfig config = configs.get();
        boolean chunked = true;
        if (download) {
            String mode = request.download().mode();
            if (mode != null && !mode.equals("chunked") && !mode.equals("direct")) {
                throw invalid("El modo de descarga debe ser chunked o direct");
            }
            chunked = !"direct".equals(mode);
            config.require("download", DatabaseConfig.DOWNLOAD);
        }
        String importDump = null;
        if (imports) {
            config.require("import", DatabaseConfig.IMPORT);
            importDump = request.importStep().dump() == null ? DumpLibrary.CURRENT : request.importStep().dump();
            if (!importDump.equals(DumpLibrary.CURRENT)) {
                DumpLibrary.requireBackupName(importDump);
            }
        }
        Path folder = null;
        List<String> files = null;
        if (scripts) {
            config.require("scripts", DatabaseConfig.SCRIPTS);
            SqlScripts sql = new SqlScripts(config);
            folder = sql.folder(request.scripts().version());
            files = sql.select(folder, request.scripts().files());
        }
        // BD-21: con «Ambas», primero hotfix y después develop.
        List<Branch> branches = both ? List.of(Branch.HOTFIX, Branch.DEVELOP) : List.of(branch);
        return new Plan(config, branches, chunked, download && Boolean.TRUE.equals(request.download().force()), importDump,
                folder, files);
    }

    private static ApiError invalid(String message) {
        return ApiError.badRequest("invalid_request", message);
    }

    // --- Ejecución (BD-12) ---

    private void execute(Job job, Plan plan) {
        boolean failed = false;
        boolean cancelled = false;
        for (Step step : job.steps) {
            if (failed || cancelled) {
                step.state("skipped");
                continue;
            }
            step.state("running");
            try {
                run(step, plan);
                step.state("done");
            } catch (InterruptedException e) {
                cancelled = true;
            } catch (StepFailed | IOException e) {
                // Una operación de ficheros interrumpida falla con IOException: también es una cancelación.
                cancelled = job.cancelRequested;
                failed = !cancelled;
                if (failed) {
                    fail(step, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                }
            } catch (RuntimeException e) {
                cancelled = job.cancelRequested;
                failed = !cancelled;
                if (failed) {
                    log.error("Error inesperado en el trabajo {} de la mini app database", job.id, e);
                    fail(step, "Error inesperado: " + e.getClass().getSimpleName());
                }
            }
            if (cancelled) {
                step.state("failed");
                step.message("Cancelado");
                job.log.add("Trabajo cancelado");
            }
        }
        // Limpia la interrupción antes de notificar.
        boolean interrupted = Thread.interrupted();
        String state = cancelled ? "cancelled" : failed ? "failed" : "succeeded";
        job.finishedAt = clock.instant();
        job.state = state;
        log.info("Trabajo {} de la mini app database terminado: {}", job.id, state);
        // BD-17: la notificación lleva a «Preparar»; un trabajo cancelado no emite ninguna.
        if (!cancelled && !interrupted) {
            notifications.send(failed ? FAILED : SUCCEEDED, null, failed ? NotificationKind.ERROR : NotificationKind.SUCCESS, "/");
        }
    }

    private static void fail(Step step, String message) {
        step.state("failed");
        step.message(message);
        step.log("ERROR: " + message);
    }

    private void run(Step step, Plan plan) throws StepFailed, IOException, InterruptedException {
        DatabaseConfig config = plan.config();
        switch (step.kind) {
            case "download" -> new S3Download(runner, config, DumpLibrary.of(config, zone), step, sleeper)
                    .run(plan.branches(), plan.chunked(), plan.force());
            case "import" -> new DockerImport(runner, config, step, sleeper)
                    .run(DumpLibrary.of(config, zone).resolve(plan.branches().get(0), plan.importDump()));
            case "scripts" -> scripts(step, plan);
            default -> throw new IllegalStateException(step.kind);
        }
    }

    /** BD-51, BD-52, BD-54 */
    private void scripts(Step step, Plan plan) throws StepFailed, IOException, InterruptedException {
        Path folder = plan.scriptsFolder();
        if (!Files.isDirectory(folder)) {
            throw new StepFailed("La carpeta " + folder + " no existe");
        }
        List<String> files = plan.scriptFiles();
        if (files.isEmpty()) {
            step.log("No hay scripts que ejecutar en " + folder);
            step.message("No hay scripts que ejecutar");
            return;
        }
        int failed = new SqlScripts(plan.config()).run(runner, step, folder, files, step::script);
        if (failed > 0) {
            throw new StepFailed(failed == 1 ? "Falló 1 script de " + files.size() : "Fallaron " + failed + " scripts de " + files.size());
        }
        step.message(files.size() == 1 ? "1 script ejecutado" : files.size() + " scripts ejecutados");
    }
}
