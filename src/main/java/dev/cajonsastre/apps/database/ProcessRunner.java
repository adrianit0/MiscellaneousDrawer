package dev.cajonsastre.apps.database;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Comandos reales con ProcessBuilder (BD-15, BD-16, BD-19). */
final class ProcessRunner implements CommandRunner {

    /** BD-19: las hereda la aplicación de su lanzador y no deben llegar a aws ni a docker. */
    static final List<String> LAUNCHER_VARIABLES = List.of("_JPACKAGE_LAUNCHER", "LD_LIBRARY_PATH");
    private static final int MAX_LINE = 8000;
    private static final Duration OUTPUT_GRACE = Duration.ofSeconds(5);

    @Override
    public int run(Command command, Output output) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command.args());
        environment(builder.environment(), command);
        if (command.stdin() != null) {
            builder.redirectInput(command.stdin().toFile());
        }
        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new CommandNotFound(command.program(), e);
        }
        if (command.stdin() == null) {
            // Sin entrada: el comando ve el final de fichero en lugar de quedarse esperando.
            process.getOutputStream().close();
        }
        Thread out = pump(process.getInputStream(), output::out, output::progress);
        Thread err = pump(process.getErrorStream(), output::err, output::progress);
        try {
            int code = process.waitFor();
            // Con plazo: un proceso hijo que siga vivo puede mantener abierta la salida.
            out.join(OUTPUT_GRACE);
            err.join(OUTPUT_GRACE);
            return code;
        } catch (InterruptedException e) {
            kill(process);
            throw e;
        }
    }

    /** BD-16, BD-19: el entorno del proceso: el heredado sin las variables del lanzador, más las del comando. */
    static void environment(Map<String, String> env, Command command) {
        LAUNCHER_VARIABLES.forEach(env::remove);
        env.putAll(command.env());
    }

    /** BD-15: el proceso y sus hijos; primero se les pide que terminen y a los 3 s se les obliga. */
    private static void kill(Process process) {
        List<ProcessHandle> tree = process.descendants().toList();
        tree.forEach(ProcessHandle::destroy);
        process.destroy();
        boolean ended = false;
        try {
            ended = process.waitFor(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (!ended) {
            tree.forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
        }
    }

    private static Thread pump(InputStream stream, Consumer<String> line, Consumer<String> progress) {
        return Thread.ofVirtual().name("cajonsastre-database-output").start(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                split(reader, line, progress);
            } catch (IOException | RuntimeException e) {
                // El proceso terminó o quien escucha falló: no hay más salida que leer.
            }
        });
    }

    /**
     * Separa la salida en líneas. Un retorno de carro sin salto de línea es una línea que el comando va a sobrescribir:
     * se entrega como progreso y no como línea.
     */
    static void split(BufferedReader reader, Consumer<String> line, Consumer<String> progress) throws IOException {
        StringBuilder text = new StringBuilder();
        boolean afterReturn = false;
        int c;
        while ((c = reader.read()) >= 0) {
            if (afterReturn) {
                afterReturn = false;
                if (c == '\n') {
                    line.accept(text.toString());
                    text.setLength(0);
                    continue;
                }
                if (!text.isEmpty()) {
                    progress.accept(text.toString());
                }
                text.setLength(0);
            }
            if (c == '\r') {
                afterReturn = true;
            } else if (c == '\n') {
                line.accept(text.toString());
                text.setLength(0);
            } else if (text.length() < MAX_LINE) {
                text.append((char) c);
            }
        }
        if (!text.isEmpty()) {
            if (afterReturn) {
                progress.accept(text.toString());
            } else {
                line.accept(text.toString());
            }
        }
    }
}
