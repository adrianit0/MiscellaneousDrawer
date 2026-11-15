package dev.cajonsastre.apps.repos;

import java.io.IOException;

/** Ejecuta comandos externos. Es una interfaz para probar los trabajos sin git ni remotos (ADR-0019). */
interface CommandRunner {

    /** Lo que va diciendo un comando, línea a línea. Se llama desde otros hilos mientras el comando corre. */
    interface Output {

        void out(String line);

        void err(String line);
    }

    /**
     * Ejecuta el comando y espera a que termine. Si el hilo se interrumpe, termina el proceso y sus hijos y lanza
     * InterruptedException (RG-30).
     *
     * @return el código de salida
     * @throws CommandNotFound si el programa no existe (RG-21)
     */
    int run(Command command, Output output) throws IOException, InterruptedException;

    /** RG-21 */
    final class CommandNotFound extends IOException {
        CommandNotFound(String program, Throwable cause) {
            super("No se encontró el comando «" + program + "»", cause);
        }
    }
}
