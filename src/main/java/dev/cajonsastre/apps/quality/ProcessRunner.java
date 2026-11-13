package dev.cajonsastre.apps.quality;

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

/** Comandos reales con ProcessBuilder (CD-22, CD-27). Copia reducida de la de «Base de datos» (P-18, ADR-0016). */
final class ProcessRunner implements CommandRunner {

    /** CD-22: las hereda la aplicación de su lanzador y no deben llegar a docker. */
    static final List<String> LAUNCHER_VARIABLES = List.of("_JPACKAGE_LAUNCHER", "LD_LIBRARY_PATH");
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
        Thread out = pump(process.getInputStream(), output::out);
        Thread err = pump(process.getErrorStream(), output::err);
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

    /** CD-22: el entorno del proceso: el heredado sin las variables del lanzador, más las del comando. */
    static void environment(Map<String, String> env, Command command) {
        LAUNCHER_VARIABLES.forEach(env::remove);
        env.putAll(command.env());
    }

    /** CD-27: el proceso y sus hijos; primero se les pide que terminen y a los 3 s se les obliga. */
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

    private static Thread pump(InputStream stream, Consumer<String> line) {
        return Thread.ofVirtual().name("cajonsastre-quality-output").start(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String text;
                while ((text = reader.readLine()) != null) {
                    line.accept(text);
                }
            } catch (IOException | RuntimeException e) {
                // El proceso terminó o quien escucha falló: no hay más salida que leer.
            }
        });
    }
}
