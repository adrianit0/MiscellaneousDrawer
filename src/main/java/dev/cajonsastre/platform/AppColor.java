package dev.cajonsastre.platform;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/** P-02, U-01: colores de mini app; cada uno es una variable del tema con contraste AA. */
public enum AppColor {
    BLUE, GREEN, VIOLET, ORANGE, CYAN, GOLD;

    @JsonValue
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}
