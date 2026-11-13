package dev.cajonsastre.apps.quality;

import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Console;
import dev.cajonsastre.platform.ConsoleState;
import dev.cajonsastre.platform.Consoles;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * CD-20 a CD-30: las comprobaciones. Una a la vez, en un hilo propio, con sus resultados en memoria y su salida en una
 * consola de la plataforma (CD-25). La última terminada se conserva hasta que empieza otra.
 */
final class QualityRunner {

    private static final Logger log = LoggerFactory.getLogger(QualityRunner.class);
    /** CD-26 */
    static final String ALL_CLEAN = "La base de datos tiene correctamente todos sus datos";
    static final String NOT_CHECKED = "No se ha podido comprobar la calidad del dato";
    /** CD-23: líneas de error que se guardan de un script. */
    static final int ERROR_LINES = 20;
    /** CD-24: caracteres de salida que se leen de un script. */
    static final int MAX_OUTPUT = 32 * 1024 * 1024;

    /** CD-28 */
    record ScriptView(String file, String state, long rowCount, boolean complete, String error) {
    }

    /** CD-28. consoleId: la consola con su salida (CD-25). */
    record RunView(long id, String state, String startedAt, String finishedAt, String message, long consoleId,
                   List<ScriptView> scripts) {
    }

    /** CD-29 */
    record ScriptTables(String file, List<MysqlXml.Table> tables, long rowCount, boolean complete) {
    }

    /** Un paso que no puede seguir (CD-21). El mensaje va en español y es apto para mostrarse. */
    private static final class Failed extends Exception {
        Failed(String message) {
            super(message);
        }
    }

    private static final class Run {
        final long id;
        final Instant startedAt;
        final Console console;
        final QualityConfig config;
        final Path folder;
        /** null: todos los de la carpeta. */
        final List<String> wanted;
        final List<ScriptView> scripts = new ArrayList<>();
        final Map<String, ScriptTables> tables = new HashMap<>();
        volatile String state = "running";
        volatile Instant finishedAt;
        volatile String message;

        Run(long id, Instant startedAt, Console console, QualityConfig config, Path folder, List<String> wanted) {
            this.id = id;
            this.startedAt = startedAt;
            this.console = console;
            this.config = config;
            this.folder = folder;
            this.wanted = wanted;
        }
    }

    private final ConfigStore configs;
    private final CommandRunner runner;
    private final Clock clock;
    private final Notifications notifications;
    private final Consoles consoles;
    private Run current;
    private Thread thread;
    private long ids;

    QualityRunner(ConfigStore configs, CommandRunner runner, Clock clock, Notifications notifications, Consoles consoles) {
        this.configs = configs;
        this.runner = runner;
        this.clock = clock;
        this.notifications = notifications;
        this.consoles = consoles;
    }

    synchronized boolean running() {
        return current != null && current.state.equals("running");
    }

    static ApiError runRunning() {
        return new ApiError(409, "run_running", "Hay una comprobación en marcha: espera a que termine o cancélala");
    }

    // --- Scripts (CD-10, CD-11) ---

    /** CD-10: los .sql de la carpeta, por orden de nombre; vacía si no existe. */
    static List<String> files(Path folder) throws IOException {
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(folder)) {
            return children.filter(Files::isRegularFile).map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith(".sql")).sorted().toList();
        }
    }

    /** CD-11: un nombre simple, que no puede salir de su carpeta. */
    static void requireSimpleName(String name) {
        if (name == null || name.isBlank() || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..")
                || name.chars().anyMatch(Character::isISOControl)) {
            throw ApiError.badRequest("invalid_request", "Nombre de fichero no válido");
        }
    }

    // --- Inicio y consulta ---

    /** CD-20: valida e inicia. 409 si ya hay una en marcha. */
    synchronized RunView start(List<String> files) throws IOException {
        if (running()) {
            throw runRunning();
        }
        QualityConfig config = configs.get();
        config.require(QualityConfig.FIELDS);
        Path folder = Path.of(config.qualitySqlDir());
        List<String> wanted = null;
        if (files != null) {
            if (files.isEmpty()) {
                throw ApiError.badRequest("invalid_request", "No hay ningún script que comprobar");
            }
            files.forEach(QualityRunner::requireSimpleName);
            // Si la carpeta no existe, la comprobación falla y lo dice (CD-21).
            if (Files.isDirectory(folder)) {
                List<String> all = files(folder);
                for (String name : files) {
                    if (!all.contains(name)) {
                        throw ApiError.badRequest("invalid_request", "El script «" + name + "» no existe en " + folder);
                    }
                }
            }
            wanted = List.copyOf(files);
        }
        long id = ++ids;
        Run run = new Run(id, clock.instant(), consoles.open("Comprobación " + id), config, folder, wanted);
        current = run;
        // S-21, CD-30: al registro del shell solo van identificadores y estados.
        log.info("Comprobación {} de la mini app quality iniciada", id);
        thread = Thread.ofPlatform().daemon().name("cajonsastre-quality-run").start(() -> execute(run));
        return view(run);
    }

    /** CD-28: la comprobación en marcha o la última terminada; null si no hay. */
    synchronized RunView view() {
        return current == null ? null : view(current);
    }

    private RunView view(Run run) {
        Instant finished = run.finishedAt;
        List<ScriptView> scripts;
        synchronized (run.scripts) {
            scripts = List.copyOf(run.scripts);
        }
        return new RunView(run.id, run.state, run.startedAt.truncatedTo(ChronoUnit.SECONDS).toString(),
                finished == null ? null : finished.truncatedTo(ChronoUnit.SECONDS).toString(), run.message,
                run.console.id(), scripts);
    }

    /** CD-29 */
    synchronized ScriptTables tables(String file) {
        requireSimpleName(file);
        ScriptTables tables = null;
        if (current != null) {
            synchronized (current.scripts) {
                tables = current.tables.get(file);
            }
        }
        if (tables == null) {
            throw ApiError.notFound("result_not_found", "El script «" + file + "» no tiene filas en la última comprobación");
        }
        return tables;
    }

    /** CD-27 */
    synchronized void cancel() {
        if (!running()) {
            throw new ApiError(409, "no_run", "No hay ninguna comprobación en marcha");
        }
        thread.interrupt();
    }

    /** CD-27: al apagar se cancela la comprobación y se espera a que suelte sus procesos. */
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

    private void execute(Run run) {
        Console console = run.console;
        String state;
        int withRows = 0;
        int withErrors = 0;
        String failure = null;
        try {
            List<String> files = prepare(run);
            if (files.isEmpty()) {
                run.message = "No hay scripts de calidad";
                console.line("No hay scripts de calidad en " + run.folder);
            } else {
                requireContainer(run);
                for (int i = 0; i < files.size(); i++) {
                    String result = script(run, i, files.get(i));
                    if (result.equals("rows")) {
                        withRows++;
                    } else if (result.equals("error")) {
                        withErrors++;
                    }
                }
                run.message = summary(withRows, withErrors, files.size());
                console.line("");
                console.line(run.message);
            }
            state = "succeeded";
        } catch (InterruptedException e) {
            state = "cancelled";
        } catch (Failed | IOException e) {
            state = "failed";
            failure = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        } catch (RuntimeException e) {
            state = "failed";
            log.error("Error inesperado en la comprobación {} de la mini app quality", run.id, e);
            failure = "Error inesperado: " + e.getClass().getSimpleName();
        }
        // Limpia la interrupción antes de notificar.
        boolean interrupted = Thread.interrupted();
        if (state.equals("cancelled") || (interrupted && !state.equals("failed"))) {
            state = "cancelled";
            run.message = "Comprobación cancelada";
            synchronized (run.scripts) {
                run.scripts.replaceAll(s -> s.state().equals("running") ? new ScriptView(s.file(), "pending", 0, true, null) : s);
            }
            console.line("Comprobación cancelada");
        } else if (failure != null) {
            run.message = failure;
            console.line("ERROR: " + failure);
        }
        int incidents = withRows + withErrors;
        // CD-25: la consola termina antes de que la comprobación deje de estar en marcha.
        console.finish(switch (state) {
            case "cancelled" -> ConsoleState.CANCELLED;
            case "succeeded" -> incidents == 0 ? ConsoleState.SUCCEEDED : ConsoleState.FAILED;
            default -> ConsoleState.FAILED;
        });
        run.finishedAt = clock.instant();
        run.state = state;
        log.info("Comprobación {} de la mini app quality terminada: {}", run.id, state);
        // CD-26: la notificación lleva a «Comprobar»; una comprobación cancelada no emite ninguna.
        switch (state) {
            case "succeeded" -> {
                if (incidents == 0) {
                    notifications.send(ALL_CLEAN, null, NotificationKind.SUCCESS, "/");
                } else {
                    notifications.send(incidents == 1 ? "1 script con incidencias" : incidents + " scripts con incidencias",
                            withRows + " con filas y " + withErrors + " con error", NotificationKind.ERROR, "/");
                }
            }
            case "failed" -> notifications.send(NOT_CHECKED, shorten(failure), NotificationKind.ERROR, "/");
            default -> {
            }
        }
    }

    /** CD-42: el resumen de una comprobación que ha ejecutado todos sus scripts. */
    static String summary(int withRows, int withErrors, int total) {
        int incidents = withRows + withErrors;
        if (incidents == 0) {
            return ALL_CLEAN;
        }
        return incidents + " de " + total + " scripts con incidencias: " + withRows + " con filas y " + withErrors + " con error";
    }

    private static String shorten(String text) {
        return text == null || text.length() <= 300 ? text : text.substring(0, 299) + "…";
    }

    /** CD-20, CD-21: los scripts que se van a ejecutar, todos pendientes. */
    private List<String> prepare(Run run) throws Failed, IOException {
        if (!Files.isDirectory(run.folder)) {
            throw new Failed("La carpeta " + run.folder + " no existe");
        }
        List<String> all = files(run.folder);
        List<String> files = run.wanted == null ? all : all.stream().filter(run.wanted::contains).toList();
        synchronized (run.scripts) {
            files.forEach(f -> run.scripts.add(new ScriptView(f, "pending", 0, true, null)));
        }
        return files;
    }

    /** CD-21: el contenedor debe estar levantado. */
    private void requireContainer(Run run) throws Failed, IOException, InterruptedException {
        Command ps = Command.of("docker", "ps", "--format", "{{.Names}}");
        run.console.line(ps.line());
        List<String> names = new ArrayList<>();
        Deque<String> errors = new ArrayDeque<>();
        int code = runner.run(ps, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                synchronized (names) {
                    names.add(line.strip());
                }
            }

            @Override
            public void err(String line) {
                run.console.line(line);
                synchronized (errors) {
                    errors.addLast(line);
                }
            }
        });
        if (code != 0) {
            String last;
            synchronized (errors) {
                last = errors.isEmpty() ? "código de salida " + code : errors.peekLast();
            }
            throw new Failed("No se ha podido consultar Docker: " + last);
        }
        synchronized (names) {
            if (!names.contains(run.config.containerName())) {
                throw new Failed("El contenedor no está levantado: " + run.config.containerName());
            }
        }
    }

    /** CD-22 */
    static Command mysql(QualityConfig config) {
        return Command.of("docker", "exec", "-i", "-e", "MYSQL_PWD", config.containerName(), "mysql",
                "--default-character-set=utf8", "-uroot", "--xml", config.databaseName())
                .withEnv("MYSQL_PWD", config.rootPassword());
    }

    /** CD-22 a CD-25: ejecuta un script y devuelve su resultado. */
    private String script(Run run, int index, String file) throws IOException, InterruptedException {
        update(run, index, new ScriptView(file, "running", 0, true, null));
        Path path = run.folder.resolve(file);
        Console console = run.console;
        if (!Files.isRegularFile(path)) {
            return error(run, index, file, List.of("El fichero " + path + " ya no existe"));
        }
        Command command = mysql(run.config).withStdin(path);
        console.line(command.line());
        StringBuilder out = new StringBuilder();
        boolean[] truncated = {false};
        Deque<String> errors = new ArrayDeque<>();
        int code = runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                synchronized (out) {
                    if (out.length() + line.length() + 1 > MAX_OUTPUT) {
                        truncated[0] = true;
                    } else if (!truncated[0]) {
                        out.append(line).append('\n');
                    }
                }
            }

            @Override
            public void err(String line) {
                synchronized (errors) {
                    errors.addLast(line);
                    if (errors.size() > ERROR_LINES) {
                        errors.removeFirst();
                    }
                }
            }
        });
        List<String> errorLines;
        synchronized (errors) {
            errorLines = List.copyOf(errors);
        }
        // CD-23: como el script de consola, cualquier salida de error es una incidencia.
        if (code != 0 || !errorLines.isEmpty()) {
            return error(run, index, file, errorLines.isEmpty() ? List.of("Código de salida " + code) : errorLines);
        }
        MysqlXml.Parsed parsed;
        synchronized (out) {
            try {
                parsed = MysqlXml.parse(out.toString(), truncated[0]);
            } catch (MysqlXml.Unreadable e) {
                return error(run, index, file, List.of(e.getMessage()));
            }
        }
        if (parsed.rowCount() == 0 && parsed.complete()) {
            update(run, index, new ScriptView(file, "clean", 0, true, null));
            return "clean";
        }
        synchronized (run.scripts) {
            run.tables.put(file, new ScriptTables(file, parsed.tables(), parsed.rowCount(), parsed.complete()));
        }
        update(run, index, new ScriptView(file, "rows", parsed.rowCount(), parsed.complete(), null));
        // CD-25: como el script de consola, las filas separadas por tabuladores.
        console.line("## " + file);
        long written = 0;
        for (MysqlXml.Table table : parsed.tables()) {
            console.line(String.join("\t", table.columns()));
            for (List<String> row : table.rows()) {
                console.line(row.stream().map(v -> v == null ? "NULL" : v).collect(Collectors.joining("\t")));
                written++;
            }
        }
        if (written < parsed.rowCount() || !parsed.complete()) {
            console.line("… " + (parsed.complete() ? "y " + (parsed.rowCount() - written) + " filas más" : "y más filas"));
        }
        console.line("");
        return "rows";
    }

    private String error(Run run, int index, String file, List<String> lines) {
        update(run, index, new ScriptView(file, "error", 0, true, String.join("\n", lines)));
        run.console.line("## " + file);
        lines.forEach(run.console::line);
        run.console.line("");
        return "error";
    }

    private static void update(Run run, int index, ScriptView view) {
        synchronized (run.scripts) {
            run.scripts.set(index, view);
        }
    }
}
