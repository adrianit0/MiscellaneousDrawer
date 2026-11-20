package dev.cajonsastre.apps.resubmit;

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
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * «Reenviar PR» (RP-01 a RP-45, ADR-0023): vuelve a pedir en Bitbucket Data Center los PR de corrección rechazados al
 * cerrar una versión. Sube solo las ramas nuevas que crea (RP-27). Sin base de datos propia.
 */
public final class ResubmitApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("resubmit", "Reenviar PR",
            "Vuelve a pedir los PR de hotfix rechazados al cerrar una versión", "resubmit", AppColor.GREEN,
            AppCategory.UTILITIES,
            List.of("pr", "pull request", "hotfix", "bitbucket", "cherry-pick", "rama", "rechazados", "git"), false);
    /** P-20, RP-33 */
    static final String BUSY = "hay un reenvío de PR en marcha";
    /** RP-20 */
    static final int MAX_PRS = 50;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final CommandRunner runner;
    private final Transport transport;
    private volatile JobRunner jobs;

    public ResubmitApp() {
        this(new ProcessRunner(), new HttpTransport());
    }

    /** Para las pruebas: git y Bitbucket simulados. */
    ResubmitApp(CommandRunner runner, Transport transport) {
        this.runner = runner;
        this.transport = transport;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ConfigStore configs = new ConfigStore(context.configDir().resolve("config.json"));
        Bitbucket bitbucket = new Bitbucket(transport);
        Clock clock = context.clock();
        JobRunner jobs = new JobRunner(runner, bitbucket, context.dataDir().resolve("worktrees"), clock,
                context.notifications(), context.consoles());
        this.jobs = jobs;

        // RP-01 a RP-04
        routes.get("/config", ctx -> ctx.json(configs.get().view()));
        routes.put("/config", ctx -> {
            if (jobs.running()) {
                throw JobRunner.jobRunning();
            }
            ResubmitConfig next = ResubmitConfig.from(body(ctx.body()), configs.get());
            configs.save(next);
            ctx.json(next.view());
        });

        // RP-05
        routes.post("/connection/test", ctx -> {
            ResubmitConfig config = configs.get();
            config.requireComplete();
            ctx.json(Map.of("ok", true, "repository", bitbucket.repository(config)));
        });

        // RP-10 a RP-14
        routes.get("/candidates", ctx -> {
            ResubmitConfig config = configs.get();
            config.requireComplete();
            List<Candidates.Candidate> list = Candidates.of(bitbucket.pullRequests(config), config.prefix(), clock.instant(),
                    List.of());
            ctx.json(Map.of("candidates", list.stream().map(Candidates.Candidate::view).toList()));
        });

        // RP-20, RP-33, RP-34
        routes.get("/job", ctx -> ctx.json(Collections.singletonMap("job", jobs.view())));
        routes.post("/jobs", ctx -> {
            List<Long> ids = prIds(body(ctx.body()));
            ResubmitConfig config = configs.get();
            config.requireComplete();
            ctx.status(202).json(Collections.singletonMap("job", jobs.start(ids, config)));
        });
        routes.post("/job/cancel", ctx -> {
            jobs.cancel();
            ctx.json(Map.of("cancelling", true));
        });
    }

    /** RP-33 */
    @Override
    public void stop() {
        JobRunner jobs = this.jobs;
        if (jobs != null) {
            jobs.stop();
        }
    }

    /** P-20, RP-33 */
    @Override
    public Optional<String> busy() {
        JobRunner jobs = this.jobs;
        return jobs != null && jobs.running() ? Optional.of(BUSY) : Optional.empty();
    }

    /** RP-20: de 1 a 50 números de PR distintos. */
    static List<Long> prIds(JsonNode body) {
        JsonNode list = body == null ? null : body.get("prIds");
        if (list == null || !list.isArray() || list.isEmpty() || list.size() > MAX_PRS) {
            throw ApiError.badRequest("invalid_request", "«prIds» debe ser una lista de 1 a " + MAX_PRS + " PR");
        }
        List<Long> ids = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (JsonNode n : list) {
            if (!n.isIntegralNumber() || !n.canConvertToLong() || n.asLong() <= 0 || !seen.add(n.asLong())) {
                throw ApiError.badRequest("invalid_request", "«prIds» debe tener números de PR distintos");
            }
            ids.add(n.asLong());
        }
        return ids;
    }

    private static JsonNode body(String text) {
        try {
            return JSON.readTree(text);
        } catch (IOException e) {
            throw ApiError.badRequest("invalid_request", "El cuerpo no es JSON válido");
        }
    }
}
