package dev.cajonsastre.apps.gestask;

import java.util.Map;
import java.util.Optional;

/**
 * GT-11: la lista cerrada de Edge Functions de Gestask que se reenvían, con el método que espera cada una. Son las
 * que usa su versión web; la mini app no añade ni cambia ninguna (ADR-0020).
 */
final class Functions {

    private static final Map<String, String> METHODS = Map.ofEntries(
            Map.entry("tasks-list", "GET"),
            Map.entry("tasks-create", "POST"),
            Map.entry("tasks-update", "PATCH"),
            Map.entry("tasks-delete", "DELETE"),
            Map.entry("tasks-completion-list", "GET"),
            Map.entry("tasks-completion-resolve", "PATCH"),
            Map.entry("tasks-order-list", "GET"),
            Map.entry("tasks-order-update", "PATCH"),
            Map.entry("configuration-list", "GET"),
            Map.entry("configuration-create", "POST"),
            Map.entry("configuration-profile-update", "PATCH"),
            Map.entry("daily-report-get", "GET"),
            Map.entry("daily-report-create", "POST"),
            Map.entry("daily-tasks-pending", "GET"),
            Map.entry("daily-tasks-complete", "PATCH"),
            Map.entry("calendar-month-get", "GET"),
            Map.entry("calendar-day-status-update", "PATCH"));

    private Functions() {
    }

    /** El método de la función en Supabase; vacío si no está en la lista. */
    static Optional<String> method(String name) {
        return Optional.ofNullable(METHODS.get(name));
    }
}
