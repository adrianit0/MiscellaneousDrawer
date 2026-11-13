package dev.cajonsastre.apps.quality;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;

/**
 * docker simulado, para probar las comprobaciones sin tenerlo instalado (ADR-0016). Lo que devuelve mysql depende del
 * contenido del script. Todos los datos son inventados (S-31):
 * <ul>
 *     <li>{@code FALLA}: un error de SQL y código 1.</li>
 *     <li>{@code AVISO}: una línea en la salida de error y código 0.</li>
 *     <li>{@code FILAS n}: un conjunto de resultados con n filas de dos columnas, id y nombre; la segunda fila tiene NULL.</li>
 *     <li>{@code VACIO}: un conjunto de resultados sin filas.</li>
 *     <li>{@code XML:} seguido de texto: ese texto tal cual.</li>
 *     <li>Cualquier otra cosa: nada, como una sentencia que no es un SELECT.</li>
 * </ul>
 */
final class FakeDocker implements CommandRunner {

    /** Todos los comandos recibidos, en orden. */
    final List<Command> commands = new CopyOnWriteArrayList<>();
    /** Los contenedores levantados que lista docker ps. */
    final Set<String> running = ConcurrentHashMap.newKeySet();
    /** Si no es null, docker ps falla con este error. */
    volatile String psError;
    /** Si es true, docker no está instalado. */
    volatile boolean missing;
    /** Si no es null, el script con este nombre espera hasta que se libere o se interrumpa. */
    volatile String blocking;
    final CountDownLatch blocked = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);

    /** Los scripts que recibió mysql, por nombre de fichero. */
    List<String> executed() {
        return commands.stream().filter(c -> c.stdin() != null).map(c -> c.stdin().getFileName().toString()).toList();
    }

    @Override
    public int run(Command command, Output output) throws IOException, InterruptedException {
        commands.add(command);
        if (missing) {
            throw new CommandNotFound(command.program(), null);
        }
        List<String> args = command.args();
        if (args.get(1).equals("ps")) {
            if (psError != null) {
                output.err(psError);
                return 1;
            }
            output.out("otro-contenedor");
            running.forEach(output::out);
            return 0;
        }
        if (!args.get(1).equals("exec")) {
            throw new IllegalStateException("Comando de docker no previsto: " + args);
        }
        if (command.stdin().getFileName().toString().equals(blocking)) {
            blocked.countDown();
            release.await();
        }
        String sql = Files.readString(command.stdin()).strip();
        if (sql.contains("FALLA")) {
            output.err("ERROR 1146 (42S02) at line 1: Table 'demo.inexistente' doesn't exist");
            return 1;
        }
        if (sql.contains("AVISO")) {
            output.err("Aviso simulado");
            return 0;
        }
        if (sql.startsWith("XML:")) {
            sql.substring(4).lines().forEach(output::out);
            return 0;
        }
        if (sql.startsWith("FILAS ")) {
            int rows = Integer.parseInt(sql.substring(6).strip());
            xml(rows).lines().forEach(output::out);
            return 0;
        }
        if (sql.equals("VACIO")) {
            xml(0).lines().forEach(output::out);
        }
        return 0;
    }

    /** Como lo escribe mysql --xml. */
    static String xml(int rows) {
        StringBuilder out = new StringBuilder("<?xml version=\"1.0\"?>\n\n<resultset statement=\"SELECT id, nombre FROM cliente\n\""
                + " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n");
        for (int i = 1; i <= rows; i++) {
            out.append("  <row>\n\t<field name=\"id\">").append(i).append("</field>\n");
            out.append(i == 2 ? "\t<field name=\"nombre\" xsi:nil=\"true\" />\n" : "\t<field name=\"nombre\">Cliente " + i + "</field>\n");
            out.append("  </row>\n");
        }
        return out.append("</resultset>\n").toString();
    }
}
