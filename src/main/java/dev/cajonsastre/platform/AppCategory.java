package dev.cajonsastre.platform;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/** P-02, L-01: categorías del lanzador, en el orden en que se muestran. */
public enum AppCategory {
    /** «Datos» */
    DATA,
    /** «Productividad» */
    PRODUCTIVITY,
    /** «Utilidades» */
    UTILITIES;

    @JsonValue
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}
