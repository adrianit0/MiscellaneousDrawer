package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;

import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * «Base de datos» (BD-01 a BD-65, ADR-0011): descarga un volcado de S3, lo importa en un contenedor MySQL de Docker y
 * ejecuta los scripts SQL pendientes, con una biblioteca de copias de los volcados. Sin base de datos propia.
 */
public final class DatabaseApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("database", "Base de datos",
            "Descarga, importa y prepara la base de datos local", "database", AppColor.VIOLET, AppCategory.DATA,
            List.of("sql", "volcados", "copias", "backups", "docker", "mysql", "scripts", "importar", "descargar", "s3"),
            false);
    /** P-20 */
    static final String BUSY = "hay un trabajo en marcha";
    private static final ObjectMapper JSON = new ObjectMapper();

    @JsonIgnoreProperties(ignoreUnknown = true)
    record KeepRequest(String branch, String source, String name) {
    }

    private final CommandRunner runner;
    private final Sleeper sleeper;
    private final ZoneId zone;
    private volatile JobRunner jobs;

    public DatabaseApp() {
        this(new ProcessRunner(), Sleeper.REAL, ZoneId.systemDefault());
    }

    /** Para las pruebas: comandos simulados, sin esperas y con una zona horaria fija. */
    DatabaseApp(CommandRunner runner, Sleeper sleeper, ZoneId zone) {
        this.runner = runner;
        this.sleeper = sleeper;
        this.zone = zone;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ConfigStore configs = new ConfigStore(context.configDir().resolve("config.json"));
        JobRunner jobs = new JobRunner(configs, runner, sleeper, zone, context.clock(), context.notifications());
        this.jobs = jobs;

        // BD-01 a BD-04
        routes.get("/config", ctx -> ctx.json(configs.get().view()));
        routes.put("/config", ctx -> {
            requireIdle(jobs);
            DatabaseConfig next = DatabaseConfig.from(JSON.readTree(ctx.body()), configs.get());
            configs.save(next);
            ctx.json(next.view());
        });

        // BD-30 a BD-37
        routes.get("/dumps", ctx -> {
            DumpLibrary library = library(configs);
            ctx.json(Map.of("branches", List.of(library.list(Branch.HOTFIX), library.list(Branch.DEVELOP))));
        });
        routes.post("/dumps/keep", ctx -> {
            requireIdle(jobs);
            KeepRequest request = JSON.readValue(ctx.body(), KeepRequest.class);
            ctx.status(201).json(library(configs).keep(branch(request.branch()), request.source(), request.name()));
        });
        routes.delete("/dumps/{branch}/{file}", ctx -> {
            requireIdle(jobs);
            library(configs).delete(branch(ctx.pathParam("branch")), ctx.pathParam("file"));
            ctx.json(Map.of("deleted", true));
        });

        // BD-50
        routes.get("/scripts", ctx -> {
            DatabaseConfig config = configs.get();
            config.require("scripts", List.of("pendingSqlDir"));
            ctx.json(new SqlScripts(config).listing(ctx.queryParam("version")));
        });

        // BD-10 a BD-15
        routes.get("/job", ctx -> {
            long after = 0;
            String param = ctx.queryParam("after");
            if (param != null) {
                try {
                    after = Math.max(0, Long.parseLong(param));
                } catch (NumberFormatException e) {
                    throw ApiError.badRequest("invalid_request", "El parámetro after debe ser un número");
                }
            }
            ctx.json(Collections.singletonMap("job", jobs.view(after)));
        });
        routes.post("/job", ctx -> ctx.status(202)
                .json(Collections.singletonMap("job", jobs.start(JSON.readValue(ctx.body(), JobRunner.Request.class)))));
        routes.post("/job/cancel", ctx -> {
            jobs.cancel();
            ctx.json(Map.of("cancelling", true));
        });
    }

    /** BD-18 */
    @Override
    public void stop() {
        JobRunner jobs = this.jobs;
        if (jobs != null) {
            jobs.stop();
        }
    }

    /** P-20, BD-18: mientras hay un trabajo, cerrar la ventana no apaga y no se puede actualizar. */
    @Override
    public Optional<String> busy() {
        JobRunner jobs = this.jobs;
        return jobs != null && jobs.running() ? Optional.of(BUSY) : Optional.empty();
    }

    /** BD-04, BD-36 */
    private static void requireIdle(JobRunner jobs) {
        if (jobs.running()) {
            throw JobRunner.jobRunning();
        }
    }

    private DumpLibrary library(ConfigStore configs) {
        DatabaseConfig config = configs.get();
        config.require("dumps", DatabaseConfig.DUMPS);
        return DumpLibrary.of(config, zone);
    }

    /** BD-37 */
    private static Branch branch(String id) {
        return Branch.of(id).orElseThrow(() -> ApiError.badRequest("invalid_request", "La rama debe ser develop o hotfix"));
    }
}
