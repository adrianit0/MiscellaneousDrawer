package dev.cajonsastre.apps.lootboxes;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.random.RandomGenerator;

/** LB-12, LB-13: la tabla de botín, versión 1, y cuántas recompensas da un cofre. */
final class LootTable {

    /** Un objeto de la tabla, con su peso sobre {@link #TOTAL}. */
    record Item(String id, String name, String rarity, int weight) {
    }

    /** LB-12: de más a menos probable. Añadir un objeto cambia la especificación y exige un ADR. */
    static final List<Item> ITEMS = List.of(
            new Item("orb-white", "Orbe blanco", "common", 8000),
            new Item("orb-green", "Orbe verde", "uncommon", 1600),
            new Item("orb-blue", "Orbe azul", "rare", 320),
            new Item("orb-purple", "Orbe morado", "epic", 65),
            new Item("orb-gold", "Orbe dorado", "legendary", 15));
    static final int TOTAL = 10_000;
    /** LB-13 */
    static final int MAX_REWARDS = 3;

    private LootTable() {
    }

    /** LB-12: el objeto que corresponde a una tirada entre 0 y TOTAL - 1. */
    static Item pick(int roll) {
        if (roll < 0 || roll >= TOTAL) {
            throw new IllegalArgumentException("Tirada fuera de rango: " + roll);
        }
        int acc = 0;
        for (Item item : ITEMS) {
            acc += item.weight();
            if (roll < acc) {
                return item;
            }
        }
        throw new IllegalStateException("Los pesos de la tabla de botín no suman " + TOTAL);
    }

    /** LB-13: de 1 a 3 recompensas, cada número con probabilidad 1/3; cada una sorteada por separado (LB-12). */
    static List<Item> roll(RandomGenerator random) {
        int count = 1 + random.nextInt(MAX_REWARDS);
        List<Item> items = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            items.add(pick(random.nextInt(TOTAL)));
        }
        return items;
    }

    static Optional<Item> find(String id) {
        return ITEMS.stream().filter(i -> i.id().equals(id)).findFirst();
    }
}
