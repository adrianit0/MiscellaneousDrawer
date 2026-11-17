package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;
import io.javalin.http.Context;

import java.util.List;
import java.util.Map;

/**
 * «Gestask» (GT-01 a GT-114, ADR-0020, ADR-0022): la versión web de Gestask dentro de Cajón de sastre, sobre el
 * mismo Supabase.
 * El servidor solo guarda la conexión, mantiene la sesión y reenvía una lista cerrada de Edge Functions sin
 * interpretarlas. Sin base de datos propia.
 */
public final class GestaskApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("gestask", "Gestask",
            "Tareas, parte diario, horario y calendario sobre Supabase", "tasks", AppColor.GOLD, AppCategory.PRODUCTIVITY,
            List.of("tareas", "backlog", "kanban", "pendientes", "jira", "supabase", "diarias", "horario", "calendario",
                    "parte"), false);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Transport transport;

    public GestaskApp() {
        this(new HttpTransport());
    }

    /** Para las pruebas: un Supabase simulado. */
    GestaskApp(Transport transport) {
        this.transport = transport;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ConfigStore configs = new ConfigStore(context.configDir().resolve("config.json"));
        Session session = new Session(configs, transport);

        // GT-01 a GT-05
        routes.get("/config", ctx -> ctx.json(configs.get().view()));
        routes.put("/config", ctx -> {
            GestaskConfig next = GestaskConfig.from(JSON.readTree(ctx.body()), configs.get());
            configs.save(next);
            session.reset();
            ctx.json(next.view());
        });

        // GT-06
        routes.post("/connection/test", ctx -> {
            session.test();
            ctx.json(Map.of("ok", true));
        });

        // GT-10, GT-11
        routes.get("/fn/{name}", ctx -> forward(ctx, session, true));
        routes.post("/fn/{name}", ctx -> forward(ctx, session, false));
    }

    /** GT-11, GT-13: el método real lo fija la lista; la interfaz solo distingue lectura y escritura. */
    private static void forward(Context ctx, Session session, boolean read) {
        String name = ctx.pathParam("name");
        String method = Functions.method(name)
                .orElseThrow(() -> ApiError.notFound("unknown_function", "Gestask no tiene la función «" + name + "»"));
        if (method.equals("GET") != read) {
            throw new ApiError(405, "method_not_allowed",
                    "La función «" + name + "» se pide con " + (read ? "POST" : "GET"));
        }
        String body = read || ctx.body().isBlank() ? null : ctx.body();
        ctx.contentType("application/json").result(session.call(name, method, ctx.queryString(), body));
    }
}
