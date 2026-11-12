package dev.cajonsastre.platform;

/**
 * P-21: las notificaciones de una mini app. El shell las guarda, las muestra en la campana de la barra superior y las
 * anuncia con sonido y notificación de escritorio según los ajustes del usuario (ADR-0013). Se puede llamar desde
 * cualquier hilo y no bloquea.
 */
public interface Notifications {

    /**
     * Emite una notificación. Un fallo del shell al guardarla o anunciarla no llega aquí.
     *
     * @param title 1 a 80 caracteres
     * @param text  detalle opcional, hasta 300 caracteres; null si no hay
     * @param path  subruta de la mini app que se abre al pulsarla, como {@code "/"} o {@code "/jobs/42"}; null para
     *              abrir la mini app como estuviera
     * @throws IllegalArgumentException si un valor no cumple el formato: es un error de programación
     */
    void send(String title, String text, NotificationKind kind, String path);

    /** Solo el título: abre la mini app como estuviera. */
    default void send(String title, NotificationKind kind) {
        send(title, null, kind, null);
    }
}
