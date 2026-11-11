package dev.cajonsastre.apps.database;

import java.io.IOException;

/** Ejecuta comandos externos. Es una interfaz para probar las secuencias completas sin aws ni docker (ADR-0011). */
interface CommandRunner {

    /** Lo que va diciendo un comando. Se llama desde otros hilos mientras el comando corre. */
    interface Output {

        void out(String line);

        void err(String line);

        /** Una línea que el comando sobrescribe en la consola (acaba en retorno de carro): su progreso. */
        default void progress(String text) {
        }
    }

    /**
     * Ejecuta el comando y espera a que termine. Si el hilo se interrumpe, termina el proceso y sus hijos y lanza
     * InterruptedException (BD-15).
     *
     * @return el código de salida
     * @throws CommandNotFound si el programa no existe (BD-19)
     */
    int run(Command command, Output output) throws IOException, InterruptedException;

    /** BD-19 */
    final class CommandNotFound extends IOException {
        CommandNotFound(String program, Throwable cause) {
            super("No se encontró el comando «" + program + "»", cause);
        }
    }
}
