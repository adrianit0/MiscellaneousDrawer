package dev.cajonsastre.apps.lootboxes;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.apps.inventory.InventoryApp;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.messages.MessageCenter;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * «Lootboxes» por su API, con el buzón real y un reloj que se mueve: LB-01 a LB-15. Los objetos llegan a un
 * «Inventario» real (IN-01). Datos inventados.
 */
class LootboxesAppTest {

    private static final String BASE = "/api/apps/lootboxes";
    private static final ZoneId ZONE = ZoneId.of("Europe/Madrid");
    private static final AppManifest GESTASK = new AppManifest("gestask", "Gestask", "Prueba", "app", AppColor.GOLD,
            AppCategory.PRODUCTIVITY, List.of(), false);
    private static final Set<String> ITEMS = Set.of("orb-white", "orb-green", "orb-blue", "orb-purple", "orb-gold");

    /** Un reloj que las pruebas mueven. */
    static final class MovingClock extends Clock {
        volatile Instant now;

        MovingClock(Instant now) {
            this.now = now;
        }

        void set(String local) {
            now = LocalDateTime.parse(local).atZone(ZONE).toInstant();
        }

        @Override
        public ZoneId getZone() {
            return ZONE;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @TempDir
    Path dir;
    final MovingClock clock = new MovingClock(LocalDateTime.parse("2026-11-20T10:00").atZone(ZONE).toInstant());
    final AtomicBoolean inventoryDown = new AtomicBoolean();
    final List<String> notified = new CopyOnWriteArrayList<>();
    final List<String> consoles = new CopyOnWriteArrayList<>();
    Store shell;
    MessageCenter center;
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        shell = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(shell, clock, Set.of("gestask", "lootboxes", "inventory")::contains);
        startApps();
    }

    private void startApps() {
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(new LootboxesApp(ZONE, new Random(7)), new InventoryApp())),
                paths, clock, manifest -> (title, text, kind, path) -> notified.add(title),
                manifest -> name -> {
                    consoles.add(name);
                    return null;
                },
                manifest -> manifest.id().equals("lootboxes") ? guarded(center.forApp(manifest)) : center.forApp(manifest));
        api = TestApi.start(List.of(registry));
    }

    private void restart() {
        api.close();
        registry.close();
        startApps();
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
        shell.close();
    }

    /** El buzón de «Lootboxes», que no puede enviar a «Inventario» mientras inventoryDown sea true. */
    private Messages guarded(Messages real) {
        return new Messages() {
            @Override
            public void send(String recipient, String type, String content) {
                if (inventoryDown.get()) {
                    throw new IllegalStateException("Base del shell no disponible");
                }
                real.send(recipient, type, content);
            }

            @Override
            public List<Message> pending() {
                return real.pending();
            }

            @Override
            public void ack(long id) {
                real.ack(id);
            }
        };
    }

    // --- Ayudas ---

    private void points(String date, String points) {
        center.forApp(GESTASK).send("lootboxes", "effort-points", "{\"date\":\"" + date + "\",\"points\":" + points + "}");
    }

    private List<String> chests() {
        HttpResponse<String> r = api.get(BASE + "/chests");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        List<String> ids = new ArrayList<>();
        TestApi.json(r).get("chests").forEach(c -> ids.add(c.get("id").asText()));
        return ids;
    }

    private List<String> earnedOn() {
        List<String> days = new ArrayList<>();
        TestApi.json(api.get(BASE + "/chests")).get("chests").forEach(c -> days.add(c.get("earnedOn").asText()));
        return days;
    }

    /** Todos los cofres, también los bloqueados, leídos de la base de la mini app. */
    private List<LootMapper.Chest> allChests() {
        return registry.find("lootboxes").orElseThrow().store()
                .read(s -> s.getMapper(LootMapper.class).unlocked("9999-12-31"));
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    private int inventoryTotal() {
        int total = 0;
        for (JsonNode item : TestApi.json(api.get("/api/apps/inventory/items")).get("items")) {
            total += item.get("count").asInt();
        }
        return total;
    }

    // --- Cofres conseguidos ---

    @Test
    void lb05_chests_of_a_day_unlock_at_8_of_the_next_day() {
        points("2026-11-20", "5.5");
        assertThat(chests()).isEmpty();

        clock.set("2026-11-21T07:59:59");
        assertThat(chests()).isEmpty();

        clock.set("2026-11-21T08:00");
        assertThat(chests()).hasSize(5);
        assertThat(earnedOn()).containsOnly("2026-11-20");
    }

    @Test
    void lb05_unlocked_chests_accumulate_and_never_expire() {
        points("2026-11-20", "2");
        clock.set("2026-11-23T09:00");
        points("2026-11-21", "1");
        points("2026-11-22", "3");
        clock.set("2026-12-30T09:00");

        assertThat(earnedOn()).containsExactly("2026-11-20", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-22",
                "2026-11-22");
    }

    @Test
    void lb02_one_chest_per_whole_pe_up_to_8_and_they_are_never_taken_away() {
        points("2026-11-20", "11");
        points("2026-11-20", "3");
        chests();
        clock.set("2026-11-21T08:00");
        points("2026-11-21", "2.9");
        points("2026-11-21", "4");
        chests();
        assertThat(allChests()).extracting(LootMapper.Chest::earnedOn)
                .containsExactly("2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20",
                        "2026-11-20", "2026-11-20", "2026-11-21", "2026-11-21", "2026-11-21", "2026-11-21");
    }

    @Test
    void lb04_a_repeated_message_creates_no_more_chests() {
        points("2026-11-20", "3");
        points("2026-11-20", "3");
        clock.set("2026-11-21T08:00");
        chests();
        points("2026-11-20", "3");
        assertThat(chests()).hasSize(3);
    }

    @Test
    void lb01_lb03_days_before_the_start_future_days_and_invalid_messages_give_nothing() {
        points("2026-11-19", "5");
        points("2026-11-21", "5");
        points("2026-11-20", "-1");
        points("2026-11-20", "\"muchos\"");
        center.forApp(GESTASK).send("lootboxes", "effort-points", "{\"date\":\"20/11/2026\",\"points\":4}");
        center.forApp(GESTASK).send("lootboxes", "other-type", "{\"date\":\"2026-11-20\",\"points\":4}");
        center.forApp(registry.find("inventory").orElseThrow().manifest())
                .send("lootboxes", "effort-points", "{\"date\":\"2026-11-20\",\"points\":4}");
        // El día futuro se juzga al leer el mensaje, hoy.
        chests();
        clock.set("2026-11-25T09:00");

        assertThat(chests()).isEmpty();
        assertThat(allChests()).isEmpty();
        // LB-04: todos se confirmaron, aunque se descartaran.
        assertThat(center.forApp(registry.find("lootboxes").orElseThrow().manifest()).pending()).isEmpty();
    }

    @Test
    void lb01_the_start_date_is_kept_across_restarts() {
        restart();
        clock.set("2026-12-01T09:00");
        restart();
        points("2026-11-25", "2");
        assertThat(chests()).hasSize(2);
    }

    @Test
    void lb02_messages_are_read_at_start() {
        points("2026-11-20", "2");
        restart();
        assertThat(allChests()).hasSize(2);
    }

    @Test
    void lb06_earning_chests_announces_nothing() {
        points("2026-11-20", "8");
        chests();
        clock.set("2026-11-21T08:00");
        api.post(BASE + "/chests/open-all", "");
        assertThat(notified).isEmpty();
        assertThat(consoles).isEmpty();
    }

    // --- Apertura ---

    @Test
    void lb10_lb13_opening_gives_one_to_three_items_of_the_table_and_only_once() {
        points("2026-11-20", "1");
        clock.set("2026-11-21T08:00");
        String id = chests().get(0);

        HttpResponse<String> r = api.post(BASE + "/chests/" + id + "/open", "");
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        JsonNode opened = TestApi.json(r);
        assertThat(opened.get("chest").asText()).isEqualTo(id);
        assertThat(opened.get("items").size()).isBetween(1, 3);
        opened.get("items").forEach(item -> {
            assertThat(item.get("id").asText()).isIn(ITEMS);
            assertThat(item.get("name").asText()).startsWith("Orbe ");
            assertThat(item.get("rarity").asText()).isIn("common", "uncommon", "rare", "epic", "legendary");
        });

        assertThat(chests()).isEmpty();
        assertError(api.post(BASE + "/chests/" + id + "/open", ""), 409, "chest_opened");
        assertError(api.post(BASE + "/chests/no-existe/open", ""), 404, "chest_not_found");
    }

    @Test
    void lb10_a_locked_chest_cannot_be_opened() {
        points("2026-11-20", "1");
        chests();
        String id = allChests().get(0).id();
        assertError(api.post(BASE + "/chests/" + id + "/open", ""), 409, "chest_locked");
        clock.set("2026-11-21T08:00");
        assertThat(api.post(BASE + "/chests/" + id + "/open", "").statusCode()).isEqualTo(200);
    }

    @Test
    void lb11_open_all_opens_every_unlocked_chest_from_the_oldest() {
        points("2026-11-20", "2");
        clock.set("2026-11-21T09:00");
        points("2026-11-21", "3");
        List<String> unlocked = chests();
        assertThat(unlocked).hasSize(2);

        JsonNode r = TestApi.json(api.post(BASE + "/chests/open-all", ""));
        List<String> opened = new ArrayList<>();
        r.get("opened").forEach(o -> opened.add(o.get("chest").asText()));
        assertThat(opened).containsExactlyElementsOf(unlocked);
        assertThat(chests()).isEmpty();
        // Los de hoy siguen bloqueados.
        assertThat(allChests()).hasSize(3);

        JsonNode none = TestApi.json(api.post(BASE + "/chests/open-all", ""));
        assertThat(none.get("opened")).isEmpty();
    }

    // --- Entrega a «Inventario» ---

    @Test
    void lb14_opened_items_reach_the_inventory() {
        points("2026-11-20", "8");
        clock.set("2026-11-21T08:00");
        assertThat(chests()).hasSize(8);
        JsonNode r = TestApi.json(api.post(BASE + "/chests/open-all", ""));
        int items = 0;
        for (JsonNode o : r.get("opened")) {
            items += o.get("items").size();
        }
        assertThat(items).isBetween(8, 24);
        assertThat(inventoryTotal()).isEqualTo(items);
    }

    @Test
    void lb15_a_failed_delivery_is_retried_and_opening_does_not_fail() {
        points("2026-11-20", "2");
        clock.set("2026-11-21T08:00");
        List<String> ids = chests();
        inventoryDown.set(true);

        HttpResponse<String> first = api.post(BASE + "/chests/" + ids.get(0) + "/open", "");
        assertThat(first.statusCode()).isEqualTo(200);
        int firstItems = TestApi.json(first).get("items").size();
        assertThat(inventoryTotal()).isZero();

        inventoryDown.set(false);
        chests();
        assertThat(inventoryTotal()).isEqualTo(firstItems);

        // Reenviar no duplica nada en el inventario (IN-02).
        restart();
        chests();
        assertThat(inventoryTotal()).isEqualTo(firstItems);
    }
}
