package dev.cajonsastre.settings;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import dev.cajonsastre.platform.ApiError;

/**
 * Ajustes de «Ajustes» (U-06), guardados en config.json (D-05).
 *
 * @param port                C-01, C-08: puerto local; se aplica al siguiente arranque. Si falta, 47800
 * @param autoShutdownMinutes C-05: apagado tras N minutos sin ventanas y sin despedida; null desactivado
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AppConfig(Integer port, Integer autoShutdownMinutes) {

    /** C-08, ADR-0002: LiteDD usa 47600. */
    public static final int DEFAULT_PORT = 47800;
    public static final int MIN_PORT = 1024;
    public static final int MAX_PORT = 65535;
    public static final int MAX_AUTO_SHUTDOWN = 1440;
    public static final AppConfig DEFAULT = new AppConfig(DEFAULT_PORT, null);

    public AppConfig {
        port = port == null ? DEFAULT_PORT : port;
    }

    /** D-05: un valor fuera de rango es un error apto para mostrarse. */
    public AppConfig validate() {
        if (port < MIN_PORT || port > MAX_PORT) {
            throw ApiError.badRequest("invalid_settings", "El puerto debe estar entre " + MIN_PORT + " y " + MAX_PORT);
        }
        if (autoShutdownMinutes != null && (autoShutdownMinutes < 1 || autoShutdownMinutes > MAX_AUTO_SHUTDOWN)) {
            throw ApiError.badRequest("invalid_settings",
                    "El apagado automático debe estar entre 1 y " + MAX_AUTO_SHUTDOWN + " minutos");
        }
        return this;
    }
}
