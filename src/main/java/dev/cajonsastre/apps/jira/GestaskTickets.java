package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * JR-50: la lista de tickets de las tareas de «Gestask», que llega por el buzón (GT-121, ADR-0030). Cada mensaje
 * sustituye la lista entera, así que uno repetido no tiene efecto.
 */
final class GestaskTickets {

    static final String SENDER = "gestask";
    static final String TYPE = "gestask-tickets";
    static final int MAX_TICKET = 255;

    private static final Logger log = LoggerFactory.getLogger(GestaskTickets.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;
    private final Messages messages;

    GestaskTickets(Store store, Messages messages) {
        this.store = store;
        this.messages = messages;
    }

    /** JR-50: procesa los mensajes pendientes y devuelve la lista guardada, vacía si nunca llegó ninguna. */
    List<String> list() {
        List<Message> batch;
        while (!(batch = messages.pending()).isEmpty()) {
            for (Message message : batch) {
                Optional<Set<String>> tickets = parse(message);
                if (tickets.isPresent()) {
                    store.write(s -> {
                        GestaskTicketMapper m = s.getMapper(GestaskTicketMapper.class);
                        m.clear();
                        tickets.get().forEach(m::insert);
                        return null;
                    });
                } else {
                    // S-21: sin el contenido.
                    log.warn("Mensaje {} de {} ({}) descartado", message.id(), message.sender(), message.type());
                }
                messages.ack(message.id());
            }
        }
        return store.read(s -> s.getMapper(GestaskTicketMapper.class).list());
    }

    /** Los tickets del mensaje, sin espacios a los lados ni repetidos; vacío si el mensaje no es una lista válida. */
    private static Optional<Set<String>> parse(Message message) {
        if (!SENDER.equals(message.sender()) || !TYPE.equals(message.type())) {
            return Optional.empty();
        }
        JsonNode list;
        try {
            list = JSON.readTree(message.content()).path("tickets");
        } catch (IOException e) {
            return Optional.empty();
        }
        if (!list.isArray()) {
            return Optional.empty();
        }
        Set<String> tickets = new LinkedHashSet<>();
        for (JsonNode item : list) {
            String ticket = item.isTextual() ? item.asText().strip() : "";
            if (ticket.isEmpty() || ticket.length() > MAX_TICKET) {
                return Optional.empty();
            }
            tickets.add(ticket);
        }
        return Optional.of(tickets);
    }
}
