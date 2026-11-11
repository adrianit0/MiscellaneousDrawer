package dev.cajonsastre.apps.database;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/** Lo que un paso cuenta de sí mismo mientras se ejecuta: su registro, su mensaje y su progreso (BD-13, BD-14, BD-27). */
interface Reporter {

    void log(String line);

    /** Lo que está haciendo ahora mismo. */
    void message(String text);

    /** BD-27: bytes descargados y totales; total 0 lo quita. */
    void progress(long done, long total);

    /** La salida de un comando va al registro, y lo que sobrescribe en la consola, al mensaje. */
    default CommandRunner.Output output() {
        return new CommandRunner.Output() {
            @Override
            public void out(String line) {
                log(line);
            }

            @Override
            public void err(String line) {
                log(line);
            }

            @Override
            public void progress(String text) {
                message(text);
            }
        };
    }

    /** Anota el comando en el registro y lo ejecuta. */
    default int run(CommandRunner runner, Command command) throws IOException, InterruptedException {
        log(command.line());
        return runner.run(command, output());
    }

    /** Como {@link #run}, pero la salida estándar se recoge en lugar de ir al registro. */
    default int capture(CommandRunner runner, Command command, StringBuilder stdout) throws IOException, InterruptedException {
        log(command.line());
        return runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                synchronized (stdout) {
                    stdout.append(line).append('\n');
                }
            }

            @Override
            public void err(String line) {
                log(line);
            }
        });
    }

    /** Como {@link #run}, y además guarda las últimas líneas de la salida de error (BD-52). */
    default int runKeepingErrors(CommandRunner runner, Command command, int keep, List<String> errors)
            throws IOException, InterruptedException {
        Deque<String> last = new ArrayDeque<>();
        log(command.line());
        int code = runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                log(line);
            }

            @Override
            public void err(String line) {
                log(line);
                synchronized (last) {
                    last.addLast(line);
                    if (last.size() > keep) {
                        last.removeFirst();
                    }
                }
            }
        });
        synchronized (last) {
            errors.addAll(last);
        }
        return code;
    }
}
