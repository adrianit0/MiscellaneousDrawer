package dev.cajonsastre.apps.database;

import java.util.Locale;
import java.util.Optional;

/** Las ramas que tienen volcado y copias propios (BD-11, BD-21). */
enum Branch {
    HOTFIX, DEVELOP;

    String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    static Optional<Branch> of(String id) {
        for (Branch b : values()) {
            if (b.id().equals(id)) {
                return Optional.of(b);
            }
        }
        return Optional.empty();
    }
}
