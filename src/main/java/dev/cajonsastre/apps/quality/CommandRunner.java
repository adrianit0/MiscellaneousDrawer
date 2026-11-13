package dev.cajonsastre.apps.quality;

import java.io.IOException;

/** Ejecuta comandos externos. Es una interfaz para probar las comprobaciones sin docker (ADR-0016). */
interface CommandRunner {

    /** Lo que va diciendo un comando, línea a línea. Se llama desde otros hilos mientras el comando corre. */
    interface Output {

        void out(String line);

        void err(String line);
    }

    /**
     * Ejecuta el comando y espera a que termine. Si el hilo se interrumpe, termina el proceso y sus hijos y lanza
     * InterruptedException (CD-27).
     *
     * @return el código de salida
     * @throws CommandNotFound si el programa no existe (CD-22)
     */
    int run(Command command, Output output) throws IOException, InterruptedException;

    /** CD-22 */
    final class CommandNotFound extends IOException {
        CommandNotFound(String program, Throwable cause) {
            super("No se encontró el comando «" + program + "»", cause);
        }
    }
}
