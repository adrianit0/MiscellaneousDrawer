package dev.cajonsastre.catalog;

import dev.cajonsastre.catalog.AppRegistry.Status;
import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import io.javalin.config.RoutesConfig;

import java.util.List;

/** P-04: GET /api/catalog, con el manifiesto, el estado y, si falló, el mensaje de cada mini app. */
public final class CatalogApi implements ApiRoutes {

    record AppDto(String id, String name, String description, String icon, AppColor color, AppCategory category,
                  List<String> keywords, Status status, String error) {
    }

    record CatalogDto(List<AppDto> apps) {
    }

    private final AppRegistry registry;

    public CatalogApi(AppRegistry registry) {
        this.registry = registry;
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/catalog", ctx -> ctx.json(new CatalogDto(registry.entries().stream().map(e -> {
            AppManifest m = e.manifest();
            return new AppDto(m.id(), m.name(), m.description(), m.icon(), m.color(), m.category(), m.keywords(),
                    e.status(), e.error());
        }).toList())));
    }
}
