package dev.cajonsastre;

import dev.cajonsastre.catalog.AppStateMapper;
import dev.cajonsastre.notifications.NotificationMapper;
import dev.cajonsastre.platform.Store;
import dev.cajonsastre.settings.SettingMapper;

import java.nio.file.Path;
import java.util.List;

/** D-04: la base del shell, con el estado de interfaz del shell y de cada mini app, y las notificaciones (P-22). */
public final class ShellDatabase {

    /** Nombre de la base en las copias previas a migrar (P-08). */
    public static final String NAME = "cajonsastre";
    /** D-02: orden de aplicación; user_version es el número de migraciones aplicadas. */
    public static final List<String> MIGRATIONS = List.of("db/shell/V001__initial.sql", "db/shell/V002__notifications.sql");
    public static final List<Class<?>> MAPPERS = List.of(SettingMapper.class, AppStateMapper.class, NotificationMapper.class);

    private ShellDatabase() {
    }

    public static Store open(Path dbFile, Path backups) {
        return Store.open(dbFile, NAME, MIGRATIONS, MAPPERS, backups);
    }
}
