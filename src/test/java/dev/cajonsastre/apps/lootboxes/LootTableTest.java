package dev.cajonsastre.apps.lootboxes;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** La tabla de botín y el número de recompensas: LB-12 y LB-13. */
class LootTableTest {

    @Test
    void lb12_the_table_has_the_five_orbs_with_their_weights() {
        assertThat(LootTable.ITEMS).extracting(LootTable.Item::id)
                .containsExactly("orb-white", "orb-green", "orb-blue", "orb-purple", "orb-gold");
        assertThat(LootTable.ITEMS).extracting(LootTable.Item::name)
                .containsExactly("Orbe blanco", "Orbe verde", "Orbe azul", "Orbe morado", "Orbe dorado");
        assertThat(LootTable.ITEMS).extracting(LootTable.Item::rarity)
                .containsExactly("common", "uncommon", "rare", "epic", "legendary");
        assertThat(LootTable.ITEMS).extracting(LootTable.Item::weight).containsExactly(8000, 1600, 320, 65, 15);
        assertThat(LootTable.ITEMS.stream().mapToInt(LootTable.Item::weight).sum()).isEqualTo(LootTable.TOTAL);
    }

    @Test
    void lb12_each_roll_falls_on_its_item() {
        assertThat(LootTable.pick(0).id()).isEqualTo("orb-white");
        assertThat(LootTable.pick(7999).id()).isEqualTo("orb-white");
        assertThat(LootTable.pick(8000).id()).isEqualTo("orb-green");
        assertThat(LootTable.pick(9599).id()).isEqualTo("orb-green");
        assertThat(LootTable.pick(9600).id()).isEqualTo("orb-blue");
        assertThat(LootTable.pick(9919).id()).isEqualTo("orb-blue");
        assertThat(LootTable.pick(9920).id()).isEqualTo("orb-purple");
        assertThat(LootTable.pick(9984).id()).isEqualTo("orb-purple");
        assertThat(LootTable.pick(9985).id()).isEqualTo("orb-gold");
        assertThat(LootTable.pick(9999).id()).isEqualTo("orb-gold");
        assertThatThrownBy(() -> LootTable.pick(10_000)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LootTable.pick(-1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void lb12_lb13_the_distribution_matches_the_probabilities() {
        Random random = new Random(20261122);
        Map<String, Integer> items = new HashMap<>();
        Map<Integer, Integer> counts = new HashMap<>();
        int chests = 300_000;
        int total = 0;
        for (int i = 0; i < chests; i++) {
            List<LootTable.Item> rolled = LootTable.roll(random);
            counts.merge(rolled.size(), 1, Integer::sum);
            for (LootTable.Item item : rolled) {
                items.merge(item.id(), 1, Integer::sum);
                total++;
            }
        }
        assertThat(counts.keySet()).containsExactlyInAnyOrder(1, 2, 3);
        for (int n = 1; n <= 3; n++) {
            assertThat(counts.get(n) / (double) chests).isCloseTo(1 / 3.0, within(0.01));
        }
        assertThat(items.get("orb-white") / (double) total).isCloseTo(0.80, within(0.005));
        assertThat(items.get("orb-green") / (double) total).isCloseTo(0.16, within(0.005));
        assertThat(items.get("orb-blue") / (double) total).isCloseTo(0.032, within(0.002));
        assertThat(items.get("orb-purple") / (double) total).isCloseTo(0.0065, within(0.001));
        assertThat(items.get("orb-gold") / (double) total).isCloseTo(0.0015, within(0.0005));
    }
}
