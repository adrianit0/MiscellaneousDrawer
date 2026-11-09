package dev.cajonsastre.platform;

import io.javalin.http.Handler;
import io.javalin.http.HandlerType;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Registro de rutas acotado al espacio de una mini app (P-06, S-16): {@code routes.get("/items", h)} publica
 * {@code GET /api/apps/<id>/items}. La mini app nunca recibe el servidor completo.
 */
public final class AppRoutes {

    public static final String PREFIX = "/api/apps/";

    /** Una ruta ya con su ruta completa. */
    public record Route(HandlerType method, String path, Handler handler) {
    }

    private final String base;
    private final List<Route> routes = new ArrayList<>();

    /** Lo crea la plataforma para cada mini app. */
    public AppRoutes(String appId) {
        this.base = PREFIX + appId;
    }

    public AppRoutes get(String path, Handler handler) {
        return add(HandlerType.GET, path, handler);
    }

    public AppRoutes post(String path, Handler handler) {
        return add(HandlerType.POST, path, handler);
    }

    public AppRoutes put(String path, Handler handler) {
        return add(HandlerType.PUT, path, handler);
    }

    public AppRoutes patch(String path, Handler handler) {
        return add(HandlerType.PATCH, path, handler);
    }

    public AppRoutes delete(String path, Handler handler) {
        return add(HandlerType.DELETE, path, handler);
    }

    /** Las rutas declaradas, con su ruta completa. */
    public List<Route> routes() {
        return List.copyOf(routes);
    }

    private AppRoutes add(HandlerType method, String path, Handler handler) {
        Objects.requireNonNull(handler, "Falta el manejador de la ruta " + path);
        if (!valid(path)) {
            throw new IllegalArgumentException("Ruta no válida para una mini app: " + path
                    + ". Debe empezar por / y no contener .., \\, ?, # ni //");
        }
        routes.add(new Route(method, base + path, handler));
        return this;
    }

    static boolean valid(String path) {
        return path != null && path.startsWith("/") && !path.contains("..") && !path.contains("\\")
                && !path.contains("?") && !path.contains("#") && !path.contains("//")
                && path.chars().noneMatch(c -> Character.isWhitespace(c) || Character.isISOControl(c));
    }
}
