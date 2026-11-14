package dev.cajonsastre.apps.processes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * «Cerrar procesos» (CP-01 a CP-34, ADR-0018): cierra a la fuerza un programa colgado y los procesos que dejó en sus
 * puertos, según los perfiles del usuario. Sin base de datos propia.
 */
public final class ProcessesApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("processes", "Cerrar procesos",
            "Cierra programas colgados y libera sus puertos", "processes", AppColor.ORANGE, AppCategory.UTILITIES,
            List.of("cerrar", "matar", "kill", "procesos", "puertos", "intellij", "colgado", "api"), false);
    /** CP-20 */
    static final int MAX_PIDS = 500;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final ProcessTable table;

    public ProcessesApp() {
        this(new SystemProcesses());
    }

    /** Para las pruebas: una tabla de procesos simulada. */
    ProcessesApp(ProcessTable table) {
        this.table = table;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ProfileStore profiles = new ProfileStore(context.configDir().resolve("profiles.json"));
        ProfileScanner scanner = new ProfileScanner(table);

        // CP-01 a CP-04
        routes.get("/profiles", ctx -> ctx.json(Map.of("profiles", profiles.list())));
        routes.post("/profiles", ctx -> ctx.status(201).json(profiles.create(body(ctx.body()))));
        routes.put("/profiles/{id}", ctx -> ctx.json(profiles.update(id(ctx.pathParam("id")), body(ctx.body()))));
        routes.delete("/profiles/{id}", ctx -> {
            profiles.delete(id(ctx.pathParam("id")));
            ctx.json(Map.of("deleted", true));
        });

        // CP-10
        routes.get("/profiles/{id}/scan", ctx -> ctx.json(scanner.scan(profiles.get(id(ctx.pathParam("id"))))));
        // CP-20
        routes.post("/profiles/{id}/close", ctx -> {
            Profile profile = profiles.get(id(ctx.pathParam("id")));
            ctx.json(scanner.close(profile, pids(body(ctx.body()))));
        });
    }

    /** CP-04: un identificador que no es un número no es el de ningún perfil. */
    private static int id(String text) {
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw ProfileStore.notFound();
        }
    }

    private static JsonNode body(String text) {
        try {
            return JSON.readTree(text);
        } catch (IOException e) {
            throw ApiError.badRequest("invalid_request", "El cuerpo no es JSON válido");
        }
    }

    /** CP-20 */
    static List<Long> pids(JsonNode body) {
        JsonNode list = body == null ? null : body.get("pids");
        if (list == null || !list.isArray() || list.isEmpty() || list.size() > MAX_PIDS) {
            throw ApiError.badRequest("invalid_request", "«pids» debe ser una lista de 1 a " + MAX_PIDS + " identificadores de proceso");
        }
        List<Long> pids = new ArrayList<>();
        for (JsonNode n : list) {
            if (!n.isIntegralNumber() || !n.canConvertToLong() || n.asLong() <= 0) {
                throw ApiError.badRequest("invalid_request", "Cada identificador de proceso debe ser un entero positivo");
            }
            pids.add(n.asLong());
        }
        return pids;
    }
}
