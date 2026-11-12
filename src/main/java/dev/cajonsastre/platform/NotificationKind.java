package dev.cajonsastre.platform;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/** P-21: tipo de una notificación. */
public enum NotificationKind {
    INFO, SUCCESS, ERROR;

    @JsonValue
    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }
}
