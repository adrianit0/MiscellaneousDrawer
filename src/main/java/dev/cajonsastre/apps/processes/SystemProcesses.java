package dev.cajonsastre.apps.processes;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Los procesos reales: {@link ProcessHandle} para verlos y cerrarlos y {@code ss} para los puertos (ADR-0018). */
final class SystemProcesses implements ProcessTable {

    /** CP-12: las hereda la aplicación de su lanzador y no deben llegar a ss. */
    static final List<String> LAUNCHER_VARIABLES = List.of("_JPACKAGE_LAUNCHER", "LD_LIBRARY_PATH");
    /** CP-12: escuchando (-l), TCP (-t), sin resolver nombres (-n), con su proceso (-p) y sin cabecera (-H). */
    static final List<String> SS = List.of("ss", "-H", "-l", "-t", "-n", "-p");
    static final String SS_MISSING = "No se encontró el comando «ss»: no se pueden buscar los procesos de los puertos";
    static final String SS_FAILED = "El comando «ss» ha fallado: no se pueden buscar los procesos de los puertos";
    /** CP-22 */
    private static final long KILL_WAIT_SECONDS = 3;
    private static final long SS_WAIT_SECONDS = 10;
    /** users:(("java",pid=1234,fd=56)) */
    private static final Pattern PID = Pattern.compile(",pid=(\\d+),fd=");

    @Override
    public long self() {
        return ProcessHandle.current().pid();
    }

    @Override
    public List<Proc> processes() {
        return ProcessHandle.allProcesses().map(h -> new Proc(h.pid(), commandLine(h))).toList();
    }

    private static String commandLine(ProcessHandle handle) {
        ProcessHandle.Info info = handle.info();
        return info.commandLine().or(info::command).orElse("");
    }

    @Override
    public List<Listener> listeners() throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(SS);
        environment(builder.environment());
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new IOException(SS_MISSING, e);
        }
        try {
            process.getOutputStream().close();
            List<String> lines = new ArrayList<>();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    lines.add(line);
                }
            }
            if (!process.waitFor(SS_WAIT_SECONDS, TimeUnit.SECONDS) || process.exitValue() != 0) {
                throw new IOException(SS_FAILED);
            }
            return parse(lines);
        } finally {
            process.destroyForcibly();
        }
    }

    /** CP-12: el entorno de ss: el heredado sin las variables del lanzador. */
    static void environment(Map<String, String> env) {
        LAUNCHER_VARIABLES.forEach(env::remove);
    }

    /**
     * CP-12, CP-15: la salida de {@code ss -H -l -t -n -p}, una línea por puerto:
     * {@code LISTEN 0 4096 *:8080 *:* users:(("java",pid=1234,fd=56))}. La última columna falta si el proceso es de
     * otro usuario. Una línea que no se entiende se ignora.
     */
    static List<Listener> parse(List<String> lines) {
        List<Listener> out = new ArrayList<>();
        for (String line : lines) {
            String[] columns = line.strip().split("\\s+", 6);
            if (columns.length < 5) {
                continue;
            }
            String local = columns[3];
            int port;
            try {
                port = Integer.parseInt(local.substring(local.lastIndexOf(':') + 1));
            } catch (NumberFormatException e) {
                continue;
            }
            List<Long> pids = new ArrayList<>();
            if (columns.length == 6) {
                Matcher m = PID.matcher(columns[5]);
                while (m.find()) {
                    pids.add(Long.parseLong(m.group(1)));
                }
            }
            out.add(new Listener(port, pids));
        }
        return out;
    }

    @Override
    public boolean kill(long pid) throws InterruptedException {
        Optional<ProcessHandle> found = ProcessHandle.of(pid);
        if (found.isEmpty()) {
            return true;
        }
        ProcessHandle handle = found.get();
        if (!handle.destroyForcibly()) {
            return !handle.isAlive();
        }
        try {
            handle.onExit().get(KILL_WAIT_SECONDS, TimeUnit.SECONDS);
            return true;
        } catch (TimeoutException | ExecutionException e) {
            return !handle.isAlive();
        }
    }
}
