package dev.cajonsastre.apps.inventory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.MiniApp;
import dev.cajonsastre.platform.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * «Inventario» (IN-01 a IN-21, ADR-0026): los objetos que llegan de los cofres de «Lootboxes» por el buzón de la
 * plataforma (ADR-0025), con cuántos hay de cada uno.
 */
public final class InventoryApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("inventory", "Inventario",
            "Los objetos conseguidos en los cofres", "inventory", AppColor.VIOLET, AppCategory.LEISURE,
            List.of("objetos", "orbes", "ocio", "recompensas", "cofres"), false);
    static final String SENDER = "lootboxes";
    static final String REWARDS = "chest-rewards";
    /** IN-03, IN-10: de la peor rareza a la mejor. */
    static final List<String> RARITIES = List.of("common", "uncommon", "rare", "epic", "legendary");

    private static final Logger log = LoggerFactory.getLogger(InventoryApp.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Un objeto de un mensaje. */
    private record Received(String id, String name, String rarity) {
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public List<String> migrations() {
        return List.of("db/apps/inventory/V001__initial.sql");
    }

    @Override
    public List<Class<?>> mappers() {
        return List.of(ItemMapper.class);
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        Store store = context.store();
        Messages messages = context.messages();
        Clock clock = context.clock();
        receive(store, messages, clock);

        routes.get("/items", ctx -> {
            receive(store, messages, clock);
            List<ItemMapper.Item> items = new ArrayList<>(store.read(s -> s.getMapper(ItemMapper.class).all()));
            // IN-10: de la mejor rareza a la peor y, dentro, por nombre.
            items.sort(Comparator.comparingInt((ItemMapper.Item i) -> -RARITIES.indexOf(i.rarity()))
                    .thenComparing(ItemMapper.Item::name));
            ctx.json(Map.of("items", items));
        });
    }

    /** IN-01 a IN-05: cada mensaje en su transacción, confirmado después. */
    private static void receive(Store store, Messages messages, Clock clock) {
        List<Message> batch;
        while (!(batch = messages.pending()).isEmpty()) {
            for (Message message : batch) {
                String problem = apply(store, clock, message);
                if (problem != null) {
                    // IN-04, S-21: sin el contenido.
                    log.warn("Mensaje {} de {} descartado: {}", message.id(), message.sender(), problem);
                }
                messages.ack(message.id());
            }
        }
    }

    /** null si se aplicó o ya estaba; si no, por qué se descarta (IN-04). */
    private static String apply(Store store, Clock clock, Message message) {
        if (!SENDER.equals(message.sender()) || !REWARDS.equals(message.type())) {
            return "tipo o remitente desconocido";
        }
        String chest;
        List<Received> items = new ArrayList<>();
        try {
            JsonNode body = JSON.readTree(message.content());
            chest = body.path("chest").asText("");
            if (chest.isBlank()) {
                return "falta el cofre";
            }
            if (!body.path("items").isArray()) {
                return "faltan los objetos";
            }
            for (JsonNode item : body.path("items")) {
                String id = item.path("id").asText("");
                String name = item.path("name").asText("");
                if (id.isBlank() || name.isBlank()) {
                    return "un objeto no tiene identificador o nombre";
                }
                String rarity = item.path("rarity").asText("");
                // IN-03: una rareza desconocida no hace perder el objeto.
                items.add(new Received(id, name, Set.copyOf(RARITIES).contains(rarity) ? rarity : "common"));
            }
        } catch (Exception e) {
            return "contenido no válido";
        }
        String at = clock.instant().truncatedTo(ChronoUnit.SECONDS).toString();
        store.write(s -> {
            ItemMapper m = s.getMapper(ItemMapper.class);
            // IN-02: cada cofre se suma una sola vez.
            if (m.received(chest) > 0) {
                return null;
            }
            m.receive(chest, at);
            for (Received item : items) {
                m.add(item.id(), item.name(), item.rarity(), at);
            }
            return null;
        });
        return null;
    }
}
