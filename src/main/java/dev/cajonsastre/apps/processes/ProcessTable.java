package dev.cajonsastre.apps.processes;

import java.io.IOException;
import java.util.List;

/**
 * Los procesos del sistema: verlos y cerrarlos. Es una interfaz para probar la mini app con una tabla simulada, sin
 * cerrar nada del equipo (ADR-0018).
 */
interface ProcessTable {

    /** Un proceso con su línea de comandos; vacía si no se puede leer. */
    record Proc(long pid, String command) {
    }

    /** Un puerto TCP en el que se escucha. pids vacío: el proceso es de otro usuario y no se ve (CP-15). */
    record Listener(int port, List<Long> pids) {

        public Listener {
            pids = List.copyOf(pids);
        }
    }

    /** CP-14: el proceso de Cajón de sastre. */
    long self();

    /** CP-11 */
    List<Proc> processes();

    /**
     * CP-12: todos los puertos TCP en los que se escucha.
     *
     * @throws IOException con un mensaje apto para mostrarse si no se pueden obtener (CP-15)
     */
    List<Listener> listeners() throws IOException, InterruptedException;

    /**
     * CP-22: termina el proceso a la fuerza y espera a que desaparezca.
     *
     * @return si ya no existe
     */
    boolean kill(long pid) throws InterruptedException;
}
