package dev.cajonsastre.platform;

/**
 * P-25: una consola abierta con {@link Consoles#open}. Es de solo lectura para el usuario: la mini app escribe y el
 * shell la muestra. Se puede llamar desde cualquier hilo y no bloquea.
 */
public interface Console {

    /** Su identificador en el shell: lo que la interfaz pasa a {@code showConsole}. */
    long id();

    /**
     * Añade texto. Un texto con saltos de línea son varias líneas; una línea de más de 2000 caracteres se corta.
     * Con la consola terminada no hace nada.
     */
    void line(String text);

    /**
     * La termina. Después, {@link #line} y este método no hacen nada.
     *
     * @throws IllegalArgumentException si el estado es null: es un error de programación
     */
    void finish(ConsoleState state);
}
