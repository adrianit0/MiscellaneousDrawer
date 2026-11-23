package dev.cajonsastre.apps.inventory;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.messages.MessageCenter;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** «Inventario» por su API, con el buzón real: IN-01 a IN-05 e IN-10 (orden). Datos inventados. */
class InventoryAppTest {

    private static final String ITEMS = "/api/apps/inventory/items";

    @TempDir
    Path dir;
    Store shell;
    MessageCenter center;
    AppRegistry registry;
    TestApi api;

    private static AppManifest manifest(String id) {
        return new AppManifest(id, "Prueba " + id, "Prueba", "app", AppColor.BLUE, AppCategory.LEISURE, List.of(), false);
    }

    @BeforeEach
    void start() {
        shell = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(shell, Clock.fixed(Instant.parse("2026-11-21T07:10:00Z"), ZoneOffset.UTC), id -> true);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(new InventoryApp())), paths,
                Clock.fixed(Instant.parse("2026-11-21T07:10:00Z"), ZoneOffset.UTC),
                m -> (title, text, kind, path) -> { }, m -> name -> null, center::forApp);
        api = TestApi.start(List.of(registry));
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
        shell.close();
    }

    private void chest(String chest, String... items) {
        center.forApp(manifest("lootboxes")).send("inventory", "chest-rewards",
                "{\"chest\":\"" + chest + "\",\"items\":[" + String.join(",", items) + "]}");
    }

    private static String item(String id, String name, String rarity) {
        return "{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"rarity\":\"" + rarity + "\"}";
    }

    private List<String> items() {
        List<String> out = new ArrayList<>();
        for (JsonNode i : TestApi.json(api.get(ITEMS)).get("items")) {
            out.add(i.get("id").asText() + " " + i.get("rarity").asText() + " ×" + i.get("count").asInt());
        }
        return out;
    }

    @Test
    void in01_in10_adds_each_item_and_lists_them_from_the_best_rarity() {
        chest("c1", item("orb-white", "Orbe blanco", "common"), item("orb-white", "Orbe blanco", "common"),
                item("orb-blue", "Orbe azul", "rare"));
        chest("c2", item("orb-gold", "Orbe dorado", "legendary"), item("orb-green", "Orbe verde", "uncommon"));

        assertThat(items()).containsExactly("orb-gold legendary ×1", "orb-blue rare ×1", "orb-green uncommon ×1",
                "orb-white common ×2");
        JsonNode first = TestApi.json(api.get(ITEMS)).get("items").get(0);
        assertThat(first.get("name").asText()).isEqualTo("Orbe dorado");
        assertThat(first.get("firstAt").asText()).isEqualTo("2026-11-21T07:10:00Z");
        assertThat(first.get("lastAt").asText()).isEqualTo("2026-11-21T07:10:00Z");
    }

    @Test
    void in02_a_chest_is_added_only_once() {
        chest("c1", item("orb-white", "Orbe blanco", "common"));
        chest("c1", item("orb-white", "Orbe blanco", "common"));
        assertThat(items()).containsExactly("orb-white common ×1");
        chest("c1", item("orb-white", "Orbe blanco", "common"));
        assertThat(items()).containsExactly("orb-white common ×1");
    }

    @Test
    void in03_name_and_rarity_come_from_the_last_message_and_an_unknown_rarity_is_common() {
        chest("c1", item("orb-white", "Orbe blanco", "common"));
        chest("c2", item("orb-white", "Orbe nacarado", "rare"));
        chest("c3", item("star", "Estrella", "mythic"));

        JsonNode list = TestApi.json(api.get(ITEMS)).get("items");
        assertThat(items()).containsExactly("orb-white rare ×2", "star common ×1");
        assertThat(list.get(0).get("name").asText()).isEqualTo("Orbe nacarado");
    }

    @Test
    void in04_in05_invalid_messages_are_discarded_and_confirmed() {
        center.forApp(manifest("gestask")).send("inventory", "chest-rewards",
                "{\"chest\":\"c1\",\"items\":[" + item("orb-white", "Orbe blanco", "common") + "]}");
        center.forApp(manifest("lootboxes")).send("inventory", "other", "{\"chest\":\"c2\",\"items\":[]}");
        center.forApp(manifest("lootboxes")).send("inventory", "chest-rewards", "{\"items\":[]}");
        center.forApp(manifest("lootboxes")).send("inventory", "chest-rewards", "{\"chest\":\"c3\"}");
        chest("c4", "{\"id\":\"orb-white\"}");
        chest("c5", "{\"name\":\"Sin id\"}");

        assertThat(items()).isEmpty();
        assertThat(center.forApp(manifest("inventory")).pending()).isEmpty();
        // Un cofre descartado no queda marcado como recibido.
        chest("c4", item("orb-white", "Orbe blanco", "common"));
        assertThat(items()).containsExactly("orb-white common ×1");
    }
}
