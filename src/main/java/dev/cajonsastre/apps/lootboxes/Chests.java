package dev.cajonsastre.apps.lootboxes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;
import org.apache.ibatis.session.SqlSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.random.RandomGenerator;

/**
 * Los cofres (LB-01 a LB-15): los que se consiguen con los PE de «Gestask», cuándo se desbloquean, su apertura y la
 * entrega de sus objetos a «Inventario».
 */
final class Chests {

    /** LB-02 */
    static final int MAX_PER_DAY = 8;
    /** LB-05 */
    static final LocalTime UNLOCK = LocalTime.of(8, 0);
    static final String SENDER = "gestask";
    static final String POINTS = "effort-points";
    static final String INVENTORY = "inventory";
    static final String REWARDS = "chest-rewards";

    private static final Logger log = LoggerFactory.getLogger(Chests.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Un cofre abierto y sus objetos. */
    record Opened(String chest, List<LootTable.Item> items) {
    }

    private final Store store;
    private final Messages messages;
    private final Clock clock;
    private final ZoneId zone;
    private final RandomGenerator random;

    Chests(Store store, Messages messages, Clock clock, ZoneId zone, RandomGenerator random) {
        this.store = store;
        this.messages = messages;
        this.clock = clock;
        this.zone = zone;
        this.random = random;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), zone);
    }

    /** LB-05: el último día cuyos cofres ya se pueden abrir: el de ayer desde las 8:00, el de anteayer antes. */
    private LocalDate lastUnlockedDay() {
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), zone);
        LocalDate day = now.toLocalDate().minusDays(1);
        return now.toLocalTime().isBefore(UNLOCK) ? day.minusDays(1) : day;
    }

    /** LB-01: la fecha de inicio se guarda una sola vez. */
    void begin() {
        String day = today().toString();
        store.write(s -> {
            s.getMapper(LootMapper.class).start(day);
            return null;
        });
    }

    /** LB-02, LB-15: lo que hay que hacer antes de responder a la interfaz. */
    void sync() {
        receive();
        deliver();
    }

    /** LB-05: los desbloqueados sin abrir, del más antiguo al más nuevo. */
    List<LootMapper.Chest> unlocked() {
        String last = lastUnlockedDay().toString();
        return store.read(s -> s.getMapper(LootMapper.class).unlocked(last));
    }

    /** LB-10 */
    Opened open(String id) {
        String last = lastUnlockedDay().toString();
        Opened opened = store.write(s -> {
            LootMapper m = s.getMapper(LootMapper.class);
            LootMapper.Chest chest = m.find(id);
            if (chest == null) {
                throw ApiError.notFound("chest_not_found", "El cofre no existe");
            }
            if (chest.openedAt() != null) {
                throw new ApiError(409, "chest_opened", "El cofre ya está abierto");
            }
            if (chest.earnedOn().compareTo(last) > 0) {
                throw new ApiError(409, "chest_locked", "El cofre todavía está bloqueado");
            }
            return openOne(m, id);
        });
        deliver();
        return opened;
    }

    /** LB-11: todos en una transacción. */
    List<Opened> openAll() {
        String last = lastUnlockedDay().toString();
        List<Opened> opened = store.write(s -> {
            LootMapper m = s.getMapper(LootMapper.class);
            List<Opened> all = new ArrayList<>();
            for (LootMapper.Chest chest : m.unlocked(last)) {
                all.add(openOne(m, chest.id()));
            }
            return all;
        });
        deliver();
        return opened;
    }

    private Opened openOne(LootMapper m, String id) {
        List<LootTable.Item> items = LootTable.roll(random);
        if (m.markOpened(id, clock.instant().truncatedTo(ChronoUnit.SECONDS).toString()) != 1) {
            throw new ApiError(409, "chest_opened", "El cofre ya está abierto");
        }
        for (int i = 0; i < items.size(); i++) {
            m.insertReward(id, i + 1, items.get(i).id());
        }
        return new Opened(id, items);
    }

    /** LB-02 a LB-04: los mensajes de «Gestask», cada uno en su transacción y confirmado después. */
    private void receive() {
        List<Message> batch;
        while (!(batch = messages.pending()).isEmpty()) {
            for (Message message : batch) {
                String problem = apply(message);
                if (problem != null) {
                    // LB-03, S-21: sin el contenido.
                    log.warn("Mensaje {} de {} descartado: {}", message.id(), message.sender(), problem);
                }
                messages.ack(message.id());
            }
        }
    }

    /** LB-02: null si se aplicó; si no, por qué se descarta (LB-03). */
    private String apply(Message message) {
        if (!SENDER.equals(message.sender()) || !POINTS.equals(message.type())) {
            return "tipo o remitente desconocido";
        }
        LocalDate day;
        double points;
        try {
            JsonNode body = JSON.readTree(message.content());
            day = LocalDate.parse(body.path("date").asText(""));
            JsonNode value = body.path("points");
            if (!value.isNumber()) {
                return "los PE no son un número";
            }
            points = value.asDouble();
        } catch (DateTimeParseException e) {
            return "fecha no válida";
        } catch (Exception e) {
            return "contenido no válido";
        }
        if (!Double.isFinite(points) || points < 0) {
            return "los PE no son un número mayor o igual que 0";
        }
        if (day.isAfter(today())) {
            return "el día es posterior a hoy";
        }
        int wanted = (int) Math.min(MAX_PER_DAY, Math.floor(points));
        LocalDate target = day;
        return store.write(s -> {
            LootMapper m = s.getMapper(LootMapper.class);
            String started = m.startedOn();
            if (started != null && target.isBefore(LocalDate.parse(started))) {
                return "el día es anterior a la fecha de inicio";
            }
            addChests(s, target.toString(), points, wanted);
            return null;
        });
    }

    /** LB-02, LB-04: crea los que faltan; nunca quita ninguno. */
    private static void addChests(SqlSession s, String day, double points, int wanted) {
        LootMapper m = s.getMapper(LootMapper.class);
        Integer had = m.chests(day);
        int existing = had == null ? 0 : had;
        for (int seq = existing + 1; seq <= wanted; seq++) {
            m.insertChest(UUID.randomUUID().toString(), day, seq);
        }
        m.saveDay(day, points, Math.max(existing, wanted));
    }

    /** LB-14, LB-15: los objetos de cada cofre abierto pasan a «Inventario»; si el envío falla, se reintenta luego. */
    synchronized void deliver() {
        List<String> pending = store.read(s -> s.getMapper(LootMapper.class).undelivered());
        for (String chest : pending) {
            List<String> items = store.read(s -> s.getMapper(LootMapper.class).rewards(chest));
            ObjectNode body = JSON.createObjectNode().put("chest", chest);
            ArrayNode list = body.putArray("items");
            for (String id : items) {
                LootTable.Item item = LootTable.find(id).orElse(new LootTable.Item(id, id, "common", 0));
                list.addObject().put("id", item.id()).put("name", item.name()).put("rarity", item.rarity());
            }
            try {
                messages.send(INVENTORY, REWARDS, body.toString());
            } catch (RuntimeException e) {
                log.warn("No se pudieron entregar a «Inventario» los objetos del cofre {}; se reintentará", chest, e);
                return;
            }
            store.write(s -> {
                s.getMapper(LootMapper.class).markDelivered(chest);
                return null;
            });
        }
    }
}
