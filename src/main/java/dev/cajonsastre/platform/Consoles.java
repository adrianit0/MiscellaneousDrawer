package dev.cajonsastre.platform;

/**
 * P-25: las consolas de una mini app. Cada una recoge la salida de texto de una ejecución y se ve en el panel
 * inferior del shell, con su nombre, su mini app y su estado (ADR-0014). Solo viven en memoria (P-26).
 */
public interface Consoles {

    /**
     * Abre una consola, que queda «En progreso» hasta que se llama a {@link Console#finish}.
     *
     * @param name 1 a 80 caracteres; distingue esta ejecución de las demás
     * @throws IllegalArgumentException si el nombre no cumple el formato: es un error de programación
     */
    Console open(String name);
}
