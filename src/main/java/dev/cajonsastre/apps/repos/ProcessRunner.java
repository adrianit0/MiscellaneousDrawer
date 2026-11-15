package dev.cajonsastre.apps.repos;

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

/** Comandos reales con ProcessBuilder (RG-21, RG-30). Copia reducida de la de «Base de datos» (P-18, ADR-0019). */
final class ProcessRunner implements CommandRunner {

    /** RG-21: las hereda la aplicación de su lanzador y no deben llegar a git. */
    static final List<String> LAUNCHER_VARIABLES = List.of("_JPACKAGE_LAUNCHER", "LD_LIBRARY_PATH");
    private static final Duration OUTPUT_GRACE = Duration.ofSeconds(5);

    @Override
    public int run(Command command, Output output) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command.args());
        environment(builder.environment(), command);
        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new CommandNotFound(command.program(), e);
        }
        // RG-21: sin entrada, el comando ve el final de fichero en lugar de quedarse esperando.
        process.getOutputStream().close();
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

    /** RG-21: el entorno heredado sin las variables del lanzador, más las del comando y las que el usuario no define. */
    static void environment(Map<String, String> env, Command command) {
        LAUNCHER_VARIABLES.forEach(env::remove);
        env.putAll(command.env());
        command.defaults().forEach(env::putIfAbsent);
    }

    /** RG-30: el proceso y sus hijos; primero se les pide que terminen y a los 3 s se les obliga. */
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
        return Thread.ofVirtual().name("cajonsastre-repos-output").start(() -> {
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
