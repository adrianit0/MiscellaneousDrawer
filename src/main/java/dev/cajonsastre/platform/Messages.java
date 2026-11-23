package dev.cajonsastre.platform;

import java.util.List;

/**
 * P-29 a P-32: el buzón de una mini app, lo único que pasa de una mini app a otra (ADR-0025). Los mensajes se guardan
 * en la base del shell hasta que su destinataria los confirma. La entrega es al menos una vez: la destinataria guarda
 * cada mensaje en su base, después lo confirma, y trata un mensaje repetido sin efecto. Se puede llamar desde
 * cualquier hilo.
 */
public interface Messages {

    /** P-29: tamaño máximo del contenido, en bytes UTF-8. */
    int MAX_CONTENT = 64 * 1024;
    /** P-30: mensajes como mucho en cada {@link #pending()}. */
    int PAGE = 100;

    /**
     * P-29: guarda un mensaje para otra mini app.
     *
     * @param recipient identificador de otra mini app del catálogo
     * @param type      qué es: {@code [a-z][a-z0-9-]{0,39}}
     * @param content   un objeto JSON de hasta 64 KB (ADR-0030)
     * @throws IllegalArgumentException si un valor no cumple el formato: es un error de programación
     * @throws RuntimeException         si no se pudo guardar: quien envía decide si reintentar
     */
    void send(String recipient, String type, String content);

    /** P-30: los mensajes dirigidos a esta mini app, del más antiguo al más nuevo y hasta {@link #PAGE}. */
    List<Message> pending();

    /** P-30: confirma un mensaje y lo borra. Uno que no es suyo o que ya no existe no hace nada. */
    void ack(long id);
}
