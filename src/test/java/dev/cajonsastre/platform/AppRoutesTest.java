package dev.cajonsastre.platform;

import io.javalin.http.Handler;
import io.javalin.http.HandlerType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AppRoutesTest {

    private static final Handler OK = ctx -> ctx.result("ok");

    @Test
    void p06_s16_routes_hang_from_the_app_namespace() {
        AppRoutes routes = new AppRoutes("tasks")
                .get("/items", OK)
                .post("/items", OK)
                .put("/items/{id}", OK)
                .patch("/items/{id}", OK)
                .delete("/items/{id}", OK)
                .get("/", OK);
        assertThat(routes.routes()).extracting(AppRoutes.Route::method).containsExactly(HandlerType.GET, HandlerType.POST,
                HandlerType.PUT, HandlerType.PATCH, HandlerType.DELETE, HandlerType.GET);
        assertThat(routes.routes()).extracting(AppRoutes.Route::path).containsExactly("/api/apps/tasks/items",
                "/api/apps/tasks/items", "/api/apps/tasks/items/{id}", "/api/apps/tasks/items/{id}",
                "/api/apps/tasks/items/{id}", "/api/apps/tasks/");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "items", "/../catalog", "/a/../../b", "/a\\b", "/a?b=1", "/a#b", "//a", "/a b", "/a\tb"})
    void p06_s16_rejects_paths_that_could_leave_the_namespace(String path) {
        AppRoutes routes = new AppRoutes("tasks");
        assertThatThrownBy(() -> routes.get(path, OK)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Ruta no válida");
        assertThat(routes.routes()).isEmpty();
    }

    @Test
    void p06_rejects_null_path_or_handler() {
        AppRoutes routes = new AppRoutes("tasks");
        assertThatThrownBy(() -> routes.get(null, OK)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> routes.get("/x", null)).isInstanceOf(NullPointerException.class);
    }
}
