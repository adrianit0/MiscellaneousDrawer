package dev.cajonsastre.catalog;

import com.fasterxml.jackson.annotation.JsonValue;
import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;
import dev.cajonsastre.platform.Store;
import io.javalin.config.RoutesConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Las mini apps en ejecución (P-04 a P-10). Arranca cada una por separado: si una falla, queda en {@code failed} y
 * las demás siguen (P-07). Publica sus rutas en su espacio y responde 503 a las de una mini app que falló.
 */
public final class AppRegistry implements ApiRoutes, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(AppRegistry.class);

    /** P-04 */
    public enum Status {
        PLANNED, AVAILABLE, FAILED;

        @JsonValue
        public String id() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** Una mini app del catálogo con su estado; store y routes solo si está disponible. */
    public record Entry(MiniApp app, Status status, String error, Store store, List<AppRoutes.Route> routes) {

        public AppManifest manifest() {
            return app.manifest();
        }
    }

    private final AppCatalog catalog;
    private final Map<String, Entry> entries;
    private final AtomicBoolean closed = new AtomicBoolean();

    private AppRegistry(AppCatalog catalog, Map<String, Entry> entries) {
        this.catalog = catalog;
        this.entries = entries;
    }

    /** P-05, P-07: arranca las mini apps en el orden del catálogo. Nunca falla por una mini app. */
    public static AppRegistry start(AppCatalog catalog, AppPaths paths, Clock clock) {
        Map<String, Entry> entries = new LinkedHashMap<>();
        for (MiniApp app : catalog.apps()) {
            Entry entry = app.manifest().planned()
                    ? new Entry(app, Status.PLANNED, null, null, List.of())
                    : startOne(app, paths, clock);
            entries.put(app.manifest().id(), entry);
        }
        return new AppRegistry(catalog, entries);
    }

    private static Entry startOne(MiniApp app, AppPaths paths, Clock clock) {
        String id = app.manifest().id();
        Store store = null;
        try {
            List<String> migrations = List.copyOf(app.migrations());
            String dir = AppPaths.migrationsDir(id);
            for (String m : migrations) {
                // P-08: una mini app solo usa sus propias migraciones.
                if (!m.startsWith(dir) || m.contains("..")) {
                    throw new IllegalArgumentException("La migración " + m + " no está en " + dir);
                }
            }
            if (!migrations.isEmpty()) {
                store = Store.open(paths.database(id), id, migrations, List.copyOf(app.mappers()), paths.backups());
            }
            AppRoutes routes = new AppRoutes(id);
            app.start(new RunningContext(id, store, paths.dataDir(id), paths.configDir(id), clock), routes);
            log.info("Mini app {} disponible", id);
            return new Entry(app, Status.AVAILABLE, null, store, routes.routes());
        } catch (Exception | LinkageError e) {
            log.error("No se pudo arrancar la mini app {}", id, e);
            if (store != null) {
                store.close();
            }
            String message = e.getMessage() == null || e.getMessage().isBlank() ? e.getClass().getSimpleName() : e.getMessage();
            return new Entry(app, Status.FAILED, message, null, List.of());
        }
    }

    public AppCatalog catalog() {
        return catalog;
    }

    /** En el orden del catálogo. */
    public List<Entry> entries() {
        return List.copyOf(entries.values());
    }

    public Optional<Entry> find(String id) {
        return Optional.ofNullable(entries.get(id));
    }

    /**
     * P-20: la primera mini app disponible que se declara ocupada, como «Base de datos» está ocupada: …; null si
     * ninguna lo está. Un fallo al preguntar cuenta como no ocupada.
     */
    public String busy() {
        if (closed.get()) {
            return null;
        }
        for (Entry e : entries.values()) {
            if (e.status() != Status.AVAILABLE) {
                continue;
            }
            try {
                Optional<String> reason = e.app().busy();
                if (reason != null && reason.isPresent()) {
                    return "«" + e.manifest().name() + "» está ocupada: " + reason.get();
                }
            } catch (RuntimeException | LinkageError ex) {
                log.warn("La mini app {} falló al preguntarle si está ocupada", e.manifest().id(), ex);
            }
        }
        return null;
    }

    @Override
    public void register(RoutesConfig routes) {
        // P-07: cualquier ruta de una mini app que falló responde 503.
        routes.before(ctx -> {
            String path = ctx.path();
            if (!path.startsWith(AppRoutes.PREFIX)) {
                return;
            }
            String rest = path.substring(AppRoutes.PREFIX.length());
            int slash = rest.indexOf('/');
            Entry e = entries.get(slash < 0 ? rest : rest.substring(0, slash));
            if (e != null && e.status() == Status.FAILED) {
                throw new ApiError(503, "app_unavailable",
                        "La mini app «" + e.manifest().name() + "» no está disponible: no se pudo arrancar",
                        Map.of("appId", e.manifest().id()));
            }
        });
        // P-06: las rutas de cada mini app disponible, ya con su prefijo.
        for (Entry e : entries.values()) {
            for (AppRoutes.Route r : e.routes()) {
                routes.addHttpHandler(r.method(), r.path(), r.handler());
            }
        }
    }

    /** P-10: avisa a las mini apps en orden inverso y cierra sus bases; un fallo no detiene el resto. */
    @Override
    public void close() {
        if (closed.getAndSet(true)) {
            return;
        }
        List<Entry> started = new ArrayList<>(entries.values().stream().filter(e -> e.status() == Status.AVAILABLE).toList());
        Collections.reverse(started);
        for (Entry e : started) {
            try {
                e.app().stop();
            } catch (RuntimeException | LinkageError ex) {
                log.warn("La mini app {} falló al apagarse", e.manifest().id(), ex);
            }
            if (e.store() != null) {
                try {
                    e.store().close();
                } catch (RuntimeException ex) {
                    log.warn("No se pudo cerrar la base de la mini app {}", e.manifest().id(), ex);
                }
            }
        }
    }

    /** P-08, P-09 */
    private record RunningContext(String appId, Store database, Path appDataDir, Path appConfigDir, Clock clock)
            implements AppContext {

        @Override
        public Store store() {
            if (database == null) {
                throw new IllegalStateException("La mini app " + appId + " no declara migraciones: no tiene base de datos");
            }
            return database;
        }

        @Override
        public Path dataDir() {
            return created(appDataDir);
        }

        @Override
        public Path configDir() {
            return created(appConfigDir);
        }

        private static Path created(Path dir) {
            try {
                return Files.createDirectories(dir);
            } catch (IOException e) {
                throw new UncheckedIOException("No se pudo crear la carpeta " + dir, e);
            }
        }
    }
}
