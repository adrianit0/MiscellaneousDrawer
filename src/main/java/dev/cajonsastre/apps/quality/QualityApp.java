package dev.cajonsastre.apps.quality;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * «Calidad del dato» (CD-01 a CD-45, ADR-0016): ejecuta los scripts SQL de validación contra el contenedor MySQL local
 * y muestra los que devuelven filas o fallan. Sin base de datos propia.
 */
public final class QualityApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("quality", "Calidad del dato",
            "Comprueba los datos de la base local con scripts SQL", "quality", AppColor.CYAN, AppCategory.DATA,
            List.of("calidad", "validación", "sql", "scripts", "comprobar", "mysql", "docker", "incidencias"), false);
    /** P-20 */
    static final String BUSY = "hay una comprobación en marcha";
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Cuerpo de POST /run. files null: todos. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record RunRequest(List<String> files) {
    }

    private final CommandRunner runner;
    private volatile QualityRunner runs;

    public QualityApp() {
        this(new ProcessRunner());
    }

    /** Para las pruebas: comandos simulados. */
    QualityApp(CommandRunner runner) {
        this.runner = runner;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        ConfigStore configs = new ConfigStore(context.configDir().resolve("config.json"));
        QualityRunner runs = new QualityRunner(configs, runner, context.clock(), context.notifications(), context.consoles());
        this.runs = runs;

        // CD-01 a CD-04
        routes.get("/config", ctx -> ctx.json(configs.get().view()));
        routes.put("/config", ctx -> {
            if (runs.running()) {
                throw QualityRunner.runRunning();
            }
            QualityConfig next = QualityConfig.from(JSON.readTree(ctx.body()), configs.get());
            configs.save(next);
            ctx.json(next.view());
        });

        // CD-10
        routes.get("/scripts", ctx -> {
            QualityConfig config = configs.get();
            config.require(List.of("qualitySqlDir"));
            Path folder = Path.of(config.qualitySqlDir());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("folder", folder.toString());
            out.put("exists", Files.isDirectory(folder));
            out.put("files", QualityRunner.files(folder));
            ctx.json(out);
        });

        // CD-20, CD-27 a CD-29
        routes.get("/run", ctx -> ctx.json(Collections.singletonMap("run", runs.view())));
        routes.post("/run", ctx -> {
            RunRequest request = ctx.body().isBlank() ? new RunRequest(null) : JSON.readValue(ctx.body(), RunRequest.class);
            if (request == null) {
                throw ApiError.badRequest("invalid_request", "Falta el cuerpo de la comprobación");
            }
            ctx.status(202).json(Collections.singletonMap("run", runs.start(request.files())));
        });
        routes.post("/run/cancel", ctx -> {
            runs.cancel();
            ctx.json(Map.of("cancelling", true));
        });
        routes.get("/run/scripts/{file}", ctx -> ctx.json(runs.tables(ctx.pathParam("file"))));
    }

    /** CD-27 */
    @Override
    public void stop() {
        QualityRunner runs = this.runs;
        if (runs != null) {
            runs.stop();
        }
    }

    /** P-20, CD-27 */
    @Override
    public Optional<String> busy() {
        QualityRunner runs = this.runs;
        return runs != null && runs.running() ? Optional.of(BUSY) : Optional.empty();
    }
}
