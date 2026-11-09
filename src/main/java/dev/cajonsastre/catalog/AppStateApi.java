package dev.cajonsastre.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Store;
import io.javalin.config.RoutesConfig;
import io.javalin.http.Context;

import java.time.Clock;
import java.time.Instant;

/**
 * P-14: GET y PUT /api/app-state/{id}, el documento de estado de interfaz de una mini app en la base del shell. Fuera
 * de /api/apps/{id}/, que pertenece a la mini app (A-04).
 */
public final class AppStateApi implements ApiRoutes {

    /** P-14 */
    public static final int MAX_BYTES = 64 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Store store;
    private final AppCatalog catalog;
    private final Clock clock;

    public AppStateApi(Store store, AppCatalog catalog, Clock clock) {
        this.store = store;
        this.catalog = catalog;
        this.clock = clock;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/app-state/{id}", ctx -> {
            String id = appId(ctx);
            String value = store.read(s -> s.getMapper(AppStateMapper.class).select(id));
            ctx.contentType("application/json").result(value == null ? "{}" : value);
        });
        routes.put("/api/app-state/{id}", ctx -> {
            String id = appId(ctx);
            if (ctx.bodyAsBytes().length > MAX_BYTES) {
                throw ApiError.badRequest("invalid_state", "El estado de una mini app no puede superar los 64 KB");
            }
            JsonNode state = JSON.readTree(ctx.body());
            if (state == null || !state.isObject()) {
                throw ApiError.badRequest("invalid_state", "El estado de una mini app debe ser un objeto JSON");
            }
            String value = state.toString();
            store.write(s -> {
                s.getMapper(AppStateMapper.class).upsert(id, value, Instant.now(clock).toString());
                return null;
            });
            ctx.contentType("application/json").result(value);
        });
    }

    private String appId(Context ctx) {
        String id = ctx.pathParam("id");
        if (!catalog.contains(id)) {
            throw ApiError.notFound("app_not_found", "No existe la mini app «" + id + "»");
        }
        return id;
    }
}
