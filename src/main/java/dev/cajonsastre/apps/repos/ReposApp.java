package dev.cajonsastre.apps.repos;

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
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * «Repositorios» (RG-01 a RG-45, ADR-0019): mantiene al día las copias locales de los repositorios git de la lista del
 * usuario. Solo trae cambios del remoto: nunca envía nada (RG-22). Sin base de datos propia.
 */
public final class ReposApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("repos", "Repositorios",
            "Mantiene al día los repositorios git del proyecto", "repos", AppColor.BLUE, AppCategory.UTILITIES,
            List.of("git", "api", "apis", "rama", "pull", "actualizar", "clonar", "repositorio"), false);
    /** P-20, RG-30 */
    static final String BUSY = "hay un trabajo de git en marcha";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final CommandRunner runner;
    private volatile JobRunner jobs;

    public ReposApp() {
        this(new ProcessRunner());
    }

    /** Para las pruebas: comandos simulados. */
    ReposApp(CommandRunner runner) {
        this.runner = runner;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        RepoStore repos = new RepoStore(context.configDir().resolve("repos.json"));
        RepoInspector inspector = new RepoInspector(runner);
        JobRunner jobs = new JobRunner(runner, inspector, context.clock(), context.notifications(), context.consoles());
        this.jobs = jobs;

        // RG-01 a RG-04
        routes.get("/repos", ctx -> ctx.json(Map.of("repos", repos.list())));
        routes.post("/repos", ctx -> {
            idle(jobs);
            ctx.status(201).json(repos.create(body(ctx.body())));
        });
        routes.put("/repos/{id}", ctx -> {
            idle(jobs);
            ctx.json(repos.update(id(ctx.pathParam("id")), body(ctx.body())));
        });
        routes.delete("/repos/{id}", ctx -> {
            idle(jobs);
            repos.delete(id(ctx.pathParam("id")));
            ctx.json(Map.of("deleted", true));
        });

        // RG-10
        routes.get("/status", ctx -> ctx.json(inspector.all(repos.list())));

        // RG-20, RG-30, RG-31
        routes.get("/job", ctx -> ctx.json(Collections.singletonMap("job", jobs.view())));
        routes.post("/jobs", ctx -> {
            JsonNode body = body(ctx.body());
            if (body == null || !body.isObject()) {
                throw ApiError.badRequest("invalid_request", "Falta el cuerpo del trabajo");
            }
            String action = text(body, "action");
            JsonNode repoId = body.get("repoId");
            Repo repo = null;
            if (repoId != null && !repoId.isNull()) {
                if (!repoId.isIntegralNumber() || !repoId.canConvertToInt()) {
                    throw ApiError.badRequest("invalid_request", "«repoId» debe ser un número entero");
                }
                repo = repos.get(repoId.asInt());
            }
            ctx.status(202).json(Collections.singletonMap("job", jobs.start(action, repo, text(body, "branch"), repos.list())));
        });
        routes.post("/job/cancel", ctx -> {
            jobs.cancel();
            ctx.json(Map.of("cancelling", true));
        });
    }

    /** RG-30 */
    @Override
    public void stop() {
        JobRunner jobs = this.jobs;
        if (jobs != null) {
            jobs.stop();
        }
    }

    /** P-20, RG-30 */
    @Override
    public Optional<String> busy() {
        JobRunner jobs = this.jobs;
        return jobs != null && jobs.running() ? Optional.of(BUSY) : Optional.empty();
    }

    /** RG-04 */
    private static void idle(JobRunner jobs) {
        if (jobs.running()) {
            throw JobRunner.jobRunning();
        }
    }

    /** RG-03: un identificador que no es un número no es el de ningún repositorio. */
    private static int id(String text) {
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw RepoStore.notFound();
        }
    }

    private static String text(JsonNode body, String key) {
        JsonNode n = body.get(key);
        return n == null || !n.isTextual() ? null : n.asText();
    }

    private static JsonNode body(String text) {
        try {
            return JSON.readTree(text);
        } catch (IOException e) {
            throw ApiError.badRequest("invalid_request", "El cuerpo no es JSON válido");
        }
    }
}
