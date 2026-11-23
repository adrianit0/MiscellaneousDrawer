package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.Messages;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * GT-121: los tickets de las tareas, leídos de {@code tasks-list}, para «Tableros Jira» (ADR-0030). Nunca hace fallar
 * la llamada reenviada, y la interfaz de «Gestask» no se entera de nada.
 */
final class GestaskTickets {

    static final String FUNCTION = "tasks-list";
    static final String RECIPIENT = "jira";
    static final String TYPE = "gestask-tickets";

    private static final Logger log = LoggerFactory.getLogger(GestaskTickets.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Messages messages;
    /** La última lista enviada desde que arrancó; null si todavía ninguna. */
    private List<String> sent;

    GestaskTickets(Messages messages) {
        this.messages = messages;
    }

    /** GT-121: tras reenviar con éxito una función; solo hace algo con el tasks-list principal. */
    synchronized void forwarded(String function, String query, String response) {
        if (!FUNCTION.equals(function)) {
            return;
        }
        try {
            if (filtersByType(query)) {
                return;
            }
            JsonNode tasks = JSON.readTree(response).path("tasks");
            if (!tasks.isArray()) {
                return;
            }
            Set<String> tickets = new TreeSet<>();
            for (JsonNode task : tasks) {
                JsonNode ticket = task.path("ticket");
                if (ticket.isTextual() && !ticket.asText().isBlank()) {
                    tickets.add(ticket.asText().strip());
                }
            }
            List<String> list = List.copyOf(tickets);
            if (list.equals(sent)) {
                return;
            }
            ObjectNode content = JSON.createObjectNode();
            ArrayNode array = content.putArray("tickets");
            list.forEach(array::add);
            String body = content.toString();
            if (body.getBytes(StandardCharsets.UTF_8).length > Messages.MAX_CONTENT) {
                log.warn("Los {} tickets de Gestask no caben en un mensaje para «Tableros Jira»", list.size());
                return;
            }
            messages.send(RECIPIENT, TYPE, body);
            sent = list;
        } catch (Exception e) {
            // S-21: sin el contenido de la respuesta.
            log.warn("No se pudieron pasar a «Tableros Jira» los tickets de Gestask: {}", e.getClass().getSimpleName());
        }
    }

    /** Las diarias se piden con ticket_type (GT-100): esa lista no es la de todas las tareas. */
    private static boolean filtersByType(String query) {
        if (query == null || query.isBlank()) {
            return false;
        }
        return Arrays.stream(query.split("&"))
                .map(part -> URLDecoder.decode(part.split("=", 2)[0], StandardCharsets.UTF_8))
                .anyMatch("ticket_type"::equals);
    }
}
