package dev.cajonsastre.notifications;

import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.NotificationKind;
import dev.cajonsastre.platform.Notifications;
import dev.cajonsastre.platform.Store;
import io.javalin.config.RoutesConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * Notificaciones de las mini apps (P-21 a P-24, ADR-0013): las valida, las guarda en la base del shell, las reparte
 * a quien escucha (las ventanas abiertas) y las anuncia en el escritorio. GET y DELETE /api/notifications.
 */
public final class NotificationCenter implements ApiRoutes {

    /** P-22 */
    public static final int KEEP = 50;
    /** P-21 */
    public static final int MAX_TITLE = 80;
    public static final int MAX_TEXT = 300;
    private static final Logger log = LoggerFactory.getLogger(NotificationCenter.class);

    /** Una notificación guardada, como sale por la API. text y path pueden ser null. */
    public record Notification(long id, String appId, String kind, String title, String text, String path,
                               String createdAt) {
    }

    private final Store store;
    private final Clock clock;
    private final Predicate<String> known;
    private final DesktopAnnouncer announcer;
    private final List<Consumer<Notification>> listeners = new CopyOnWriteArrayList<>();

    /**
     * @param store la base del shell
     * @param known P-22: si un identificador sigue en el catálogo
     */
    public NotificationCenter(Store store, Clock clock, Predicate<String> known, DesktopAnnouncer announcer) {
        this.store = store;
        this.clock = clock;
        this.known = known;
        this.announcer = announcer;
    }

    /** P-21: las notificaciones de una mini app, ya con su identidad. */
    public Notifications forApp(AppManifest app) {
        return (title, text, kind, path) -> send(app, title, text, kind, path);
    }

    /** P-23: avisa de cada notificación nueva, ya guardada. */
    public void onNotification(Consumer<Notification> listener) {
        listeners.add(listener);
    }

    /** P-22: de la más reciente a la más antigua, sin las de mini apps que ya no están en el catálogo. */
    public List<Notification> list() {
        return store.read(s -> s.getMapper(NotificationMapper.class).selectAll()).stream()
                .filter(n -> known.test(n.appId())).toList();
    }

    /** P-22 */
    public void clear() {
        store.write(s -> {
            s.getMapper(NotificationMapper.class).deleteAll();
            return null;
        });
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/notifications", ctx -> ctx.json(Map.of("notifications", list())));
        routes.delete("/api/notifications", ctx -> {
            clear();
            ctx.json(Map.of("notifications", List.of()));
        });
    }

    private void send(AppManifest app, String title, String text, NotificationKind kind, String path) {
        // P-21: un valor fuera de formato es un error de programación de la mini app.
        String cleanTitle = title == null ? "" : title.strip();
        if (cleanTitle.isEmpty() || cleanTitle.length() > MAX_TITLE) {
            throw new IllegalArgumentException("El título de una notificación debe tener de 1 a " + MAX_TITLE + " caracteres");
        }
        String cleanText = text == null || text.isBlank() ? null : text.strip();
        if (cleanText != null && cleanText.length() > MAX_TEXT) {
            throw new IllegalArgumentException("El texto de una notificación no puede superar los " + MAX_TEXT + " caracteres");
        }
        if (kind == null) {
            throw new IllegalArgumentException("Falta el tipo de la notificación");
        }
        if (path != null && !AppRoutes.valid(path)) {
            throw new IllegalArgumentException("Subruta no válida para una notificación: " + path);
        }
        // P-21: un fallo del shell no llega a la mini app. S-21: al registro no van el título ni el texto.
        try {
            String createdAt = clock.instant().truncatedTo(ChronoUnit.SECONDS).toString();
            long id = store.write(s -> {
                NotificationMapper m = s.getMapper(NotificationMapper.class);
                m.insert(app.id(), kind.id(), cleanTitle, cleanText, path, createdAt);
                long inserted = m.lastId();
                m.prune(KEEP);
                return inserted;
            });
            Notification notification = new Notification(id, app.id(), kind.id(), cleanTitle, cleanText, path, createdAt);
            for (Consumer<Notification> listener : listeners) {
                try {
                    listener.accept(notification);
                } catch (RuntimeException e) {
                    log.warn("No se pudo repartir la notificación {} de la mini app {}", id, app.id(), e);
                }
            }
            announcer.announce(app.name(), cleanTitle);
        } catch (RuntimeException e) {
            log.warn("No se pudo guardar o anunciar una notificación de la mini app {}", app.id(), e);
        }
    }
}
