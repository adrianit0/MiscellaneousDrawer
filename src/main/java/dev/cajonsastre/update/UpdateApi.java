package dev.cajonsastre.update;

import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.ApiError;
import io.javalin.config.RoutesConfig;

import java.util.Map;

/** GET /api/update, POST /api/update/check y POST /api/update/apply (ADR-0010). */
public final class UpdateApi implements ApiRoutes {

    record ApplyRequest(Long build) {
    }

    private final Updater updater;
    private final Runnable exit;

    public UpdateApi(Updater updater, Runnable exit) {
        this.updater = updater;
        this.exit = exit;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/update", ctx -> ctx.json(updater.status()));

        routes.post("/api/update/check", ctx -> ctx.json(updater.check()));

        routes.post("/api/update/apply", ctx -> {
            ApplyRequest req = ctx.bodyAsClass(ApplyRequest.class);
            if (req == null || req.build() == null) {
                throw ApiError.badRequest("invalid_update", "Falta el build que se quiere instalar");
            }
            updater.apply(req.build());
            ctx.json(Map.of("restarting", true));
            // R-43: se responde antes de apagar, como /api/shutdown.
            Thread.ofVirtual().name("cajonsastre-update-stop").start(() -> {
                try {
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                exit.run();
            });
        });
    }
}
