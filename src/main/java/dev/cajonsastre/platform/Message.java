package dev.cajonsastre.platform;

/**
 * P-30: un mensaje recibido de otra mini app.
 *
 * @param id      para confirmarlo con {@link Messages#ack(long)}
 * @param sender  identificador de la mini app que lo envió
 * @param type    qué es, según quien lo envía
 * @param content un objeto JSON
 * @param sentAt  ISO-8601 UTC
 */
public record Message(long id, String sender, String type, String content, String sentAt) {
}
