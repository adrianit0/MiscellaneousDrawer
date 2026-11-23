package dev.cajonsastre.messages;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * Mensajes entre mini apps (P-29 a P-32, ADR-0025): los valida y los guarda en la base del shell hasta que su
 * destinataria los confirma. No tiene rutas de API ni eventos (P-31).
 */
public final class MessageCenter {

    /** P-29 */
    private static final Pattern TYPE = Pattern.compile("[a-z][a-z0-9-]{0,39}");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;
    private final Clock clock;
    private final Predicate<String> known;

    /**
     * @param store la base del shell
     * @param known P-29: si un identificador está en el catálogo
     */
    public MessageCenter(Store store, Clock clock, Predicate<String> known) {
        this.store = store;
        this.clock = clock;
        this.known = known;
    }

    /** P-29: el buzón de una mini app, con su identificador como remitente y destinataria. */
    public Messages forApp(AppManifest app) {
        String id = app.id();
        return new Messages() {
            @Override
            public void send(String recipient, String type, String content) {
                MessageCenter.this.send(id, recipient, type, content);
            }

            @Override
            public List<Message> pending() {
                return store.read(s -> s.getMapper(MessageMapper.class).pending(id, PAGE));
            }

            @Override
            public void ack(long messageId) {
                store.write(s -> {
                    s.getMapper(MessageMapper.class).delete(id, messageId);
                    return null;
                });
            }
        };
    }

    private void send(String sender, String recipient, String type, String content) {
        // P-29: un valor fuera de formato es un error de programación de la mini app.
        if (recipient == null || !known.test(recipient)) {
            throw new IllegalArgumentException("La mini app destinataria no está en el catálogo: " + recipient);
        }
        if (recipient.equals(sender)) {
            throw new IllegalArgumentException("Una mini app no puede enviarse mensajes a sí misma");
        }
        if (type == null || !TYPE.matcher(type).matches()) {
            throw new IllegalArgumentException("Tipo de mensaje no válido: " + type);
        }
        if (content == null || content.getBytes(StandardCharsets.UTF_8).length > Messages.MAX_CONTENT) {
            throw new IllegalArgumentException("El contenido de un mensaje debe ocupar como mucho " + Messages.MAX_CONTENT + " bytes");
        }
        try {
            JsonNode node = JSON.readTree(content);
            if (node == null || !node.isObject()) {
                throw new IllegalArgumentException("El contenido de un mensaje debe ser un objeto JSON");
            }
        } catch (JsonProcessingException e) {
            // S-21: el contenido no va al mensaje de error.
            throw new IllegalArgumentException("El contenido de un mensaje no es JSON válido");
        }
        String sentAt = clock.instant().truncatedTo(ChronoUnit.SECONDS).toString();
        store.write(s -> {
            s.getMapper(MessageMapper.class).insert(sender, recipient, type, content, sentAt);
            return null;
        });
    }
}
