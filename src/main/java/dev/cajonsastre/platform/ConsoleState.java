package dev.cajonsastre.platform;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/** P-25: cómo termina una consola. Mientras no termina está en progreso ({@code running}). */
public enum ConsoleState {
    /** «Terminado» */
    SUCCEEDED,
    /** «Error» */
    FAILED,
    /** «Cancelado» */
    CANCELLED;

    @JsonValue
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}
