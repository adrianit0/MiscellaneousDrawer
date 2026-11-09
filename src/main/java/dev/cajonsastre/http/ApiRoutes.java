package dev.cajonsastre.http;

import io.javalin.config.RoutesConfig;

/** Un grupo de rutas del shell que se registra al arrancar el servidor. Las mini apps usan {@code AppRoutes}. */
public interface ApiRoutes {

    void register(RoutesConfig routes);
}
