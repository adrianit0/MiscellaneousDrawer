package dev.cajonsastre.catalog;

import java.nio.file.Path;

/**
 * Carpetas de las mini apps (P-08, P-09).
 *
 * @param dataRoot   {@code ~/.local/share/cajonsastre}
 * @param configRoot {@code ~/.config/cajonsastre}
 * @param backups    copias previas a migrar
 */
public record AppPaths(Path dataRoot, Path configRoot, Path backups) {

    /** P-09: {@code <datos>/apps/<id>/} */
    public Path dataDir(String appId) {
        return dataRoot.resolve("apps").resolve(appId);
    }

    /** P-09: {@code <config>/apps/<id>/} */
    public Path configDir(String appId) {
        return configRoot.resolve("apps").resolve(appId);
    }

    /** P-08: {@code <datos>/apps/<id>/data.db} */
    public Path database(String appId) {
        return dataDir(appId).resolve("data.db");
    }

    /** P-08: prefijo obligatorio de las migraciones de una mini app. */
    public static String migrationsDir(String appId) {
        return "db/apps/" + appId + "/";
    }
}
