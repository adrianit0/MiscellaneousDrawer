package dev.cajonsastre.lifecycle;

import dev.cajonsastre.http.ApiRoutes;
import io.javalin.config.RoutesConfig;
import io.javalin.http.sse.SseClient;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * /api/events (presencia, C-04), /api/presence/bye (C-05) y /api/shutdown (C-06). La interfaz abre /api/events con
 * fetch para poder enviar el token (S-12).
 */
public final class LifecycleApi implements ApiRoutes {

    /** C-04: una conexión cerrada se descubre al escribir; con 5 s se detecta antes de que venza la despedida. */
    static final long HEARTBEAT_SECONDS = 5;

    private final Presence presence;
    private final Runnable shutdown;
    private final Set<SseClient> clients = ConcurrentHashMap.newKeySet();

    public LifecycleApi(Presence presence, Runnable shutdown) {
        this.presence = presence;
        this.shutdown = shutdown;
        presence.scheduler().scheduleAtFixedRate(() -> clients.forEach(c -> {
            try {
                c.sendComment("latido");
            } catch (RuntimeException e) {
                c.close();
            }
        }), HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.sse("/api/events", client -> {
            client.keepAlive();
            clients.add(client);
            presence.connected();
            client.onClose(() -> {
                if (clients.remove(client)) {
                    presence.disconnected();
                }
            });
            client.sendComment("conectado");
        });

        routes.post("/api/presence/bye", ctx -> {
            presence.bye();
            ctx.json(Map.of("ok", true));
        });

        routes.post("/api/shutdown", ctx -> {
            ctx.json(Map.of("stopping", true));
            // Se responde antes de apagar.
            Thread.ofVirtual().name("cajonsastre-stop").start(() -> {
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                shutdown.run();
            });
        });
    }
}
