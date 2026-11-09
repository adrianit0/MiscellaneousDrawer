package dev.cajonsastre;

import dev.cajonsastre.catalog.AppPaths;

import java.nio.file.Path;

/**
 * Rutas en disco (C-02, C-08, C-09): carpetas {@code cajonsastre} propias, distintas de las de LiteDD. Respeta
 * XDG_DATA_HOME, XDG_CONFIG_HOME y XDG_STATE_HOME si están definidas.
 */
public final class DataPaths {

    /** C-08: nombre de las carpetas XDG. */
    static final String DIR = "cajonsastre";

    private DataPaths() {
    }

    static Path resolve(String value, String home, String... fallback) {
        Path base = value != null && !value.isBlank() ? Path.of(value) : Path.of(home, fallback);
        return base.resolve(DIR);
    }

    private static Path xdg(String variable, String... fallback) {
        return resolve(System.getenv(variable), System.getProperty("user.home"), fallback);
    }

    /** ~/.local/share/cajonsastre */
    public static Path dataDir() {
        return xdg("XDG_DATA_HOME", ".local", "share");
    }

    /** D-04: base del shell. */
    public static Path shellDatabase() {
        return dataDir().resolve("cajonsastre.db");
    }

    public static Path backups() {
        return dataDir().resolve("backups");
    }

    /** ~/.config/cajonsastre */
    public static Path configDir() {
        return xdg("XDG_CONFIG_HOME", ".config");
    }

    /** D-05 */
    public static Path configFile() {
        return configDir().resolve("config.json");
    }

    /** ~/.local/state/cajonsastre: registro, instancia en marcha y perfil de Chrome. */
    public static Path stateDir() {
        return xdg("XDG_STATE_HOME", ".local", "state");
    }

    /** C-02, C-06 */
    public static Path instanceFile() {
        return stateDir().resolve("instance.json");
    }

    /** C-03 */
    public static Path chromeProfile() {
        return stateDir().resolve("chrome");
    }

    /** C-09 */
    public static Path logFile() {
        return stateDir().resolve("cajonsastre.log");
    }

    /** P-08, P-09: carpetas de las mini apps. */
    public static AppPaths appPaths() {
        return new AppPaths(dataDir(), configDir(), backups());
    }
}
