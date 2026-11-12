package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.catalog.CatalogApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static dev.cajonsastre.apps.database.Fixtures.BUCKET;
import static dev.cajonsastre.apps.database.Fixtures.MONDAY;
import static dev.cajonsastre.apps.database.Fixtures.TUESDAY;
import static dev.cajonsastre.apps.database.Fixtures.WEDNESDAY;
import static org.assertj.core.api.Assertions.assertThat;

/** La mini app entera por su API, con el servidor real y aws y docker simulados (BD-01 a BD-54, P-20). */
class DatabaseAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/database";
    private static final String FULL_JOB = """
            {"branch": "hotfix", "download": {"mode": "chunked", "force": false}, "import": {"dump": "current"},
             "scripts": {"version": null, "files": null}}
            """;

    @TempDir
    Path dir;
    final FakeCommands commands = new FakeCommands();
    final Fixtures.NoSleep sleeper = new Fixtures.NoSleep();
    /** BD-17: las notificaciones que emite la mini app, como «tipo|título|texto|subruta». */
    final List<String> notifications = new CopyOnWriteArrayList<>();
    DatabaseApp app;
    AppRegistry registry;
    TestApi api;
    DatabaseConfig config;
    Path work;
    Path pending;

    @BeforeEach
    void start() throws IOException {
        app = new DatabaseApp(commands, sleeper, Fixtures.ZONE);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(app)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> notifications.add(kind.id() + "|" + title + "|" + text + "|" + path));
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
        config = Fixtures.config(dir);
        work = Path.of(config.workDir());
        pending = Path.of(config.pendingSqlDir());
        commands.put(Fixtures.s3Key(Branch.HOTFIX), "volcado de hotfix del martes", TUESDAY);
        commands.put(Fixtures.s3Key(Branch.DEVELOP), "volcado de develop del martes", TUESDAY);
        commands.put(BUCKET + "/volcados/dynamodb/Dockerfile", "FROM demo", MONDAY);
        commands.put(BUCKET + "/volcados/dynamodb/dynamo-db-dump.tar.bz2", "dynamo", MONDAY);
        Files.writeString(pending.resolve("TAREA-1.sql"), "UPDATE a;");
        Files.writeString(pending.resolve("TAREA-2.sql"), "UPDATE b;");
    }

    @AfterEach
    void stop() {
        commands.release.countDown();
        api.close();
        registry.close();
    }

    // --- Ayudas ---

    private ObjectNode body(DatabaseConfig c) {
        return JSON.valueToTree(c);
    }

    private void configure() {
        assertThat(api.put(BASE + "/config", body(config).toString()).statusCode()).isEqualTo(200);
    }

    private HttpResponse<String> startJob(String body) {
        return api.post(BASE + "/job", body);
    }

    private JsonNode job(long after) {
        return TestApi.json(api.get(BASE + "/job?after=" + after)).get("job");
    }

    /** Espera a que el trabajo termine y lo devuelve entero. */
    private JsonNode finished() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        JsonNode job = job(0);
        while (job.get("state").asText().equals("running") && System.nanoTime() < deadline) {
            Thread.sleep(20);
            job = job(0);
        }
        return job;
    }

    private JsonNode run(String body) throws InterruptedException {
        HttpResponse<String> r = startJob(body);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        return finished();
    }

    private static List<String> lines(JsonNode job) {
        List<String> out = new ArrayList<>();
        job.get("log").get("lines").forEach(l -> out.add(l.asText()));
        return out;
    }

    private static List<String> stepStates(JsonNode job) {
        List<String> out = new ArrayList<>();
        job.get("steps").forEach(s -> out.add(s.get("kind").asText() + ":" + s.get("state").asText()));
        return out;
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    private JsonNode dumps(String branch) {
        for (JsonNode b : TestApi.json(api.get(BASE + "/dumps")).get("branches")) {
            if (b.get("branch").asText().equals(branch)) {
                return b;
            }
        }
        throw new AssertionError(branch);
    }

    private static String encode(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private void holdAt(String argument) {
        commands.blocking = c -> c.args().contains(argument);
    }

    /** La notificación se emite justo después de que el trabajo deje de estar en marcha. */
    private void awaitNotifications(int count) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (notifications.size() < count && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
    }

    private void awaitHeld() throws InterruptedException {
        assertThat(commands.blocked.await(10, TimeUnit.SECONDS)).as("el trabajo llegó al comando").isTrue();
    }

    // --- Catálogo y configuración ---

    @Test
    void adr0011_database_is_available_with_its_own_description() {
        JsonNode database = TestApi.json(api.get("/api/catalog")).get("apps").get(0);
        assertThat(database.get("id").asText()).isEqualTo("database");
        assertThat(database.get("status").asText()).isEqualTo("available");
        assertThat(database.get("name").asText()).isEqualTo("Base de datos");
        assertThat(database.get("description").asText()).isEqualTo("Descarga, importa y prepara la base de datos local");
        assertThat(database.get("color").asText()).isEqualTo("violet");
        assertThat(database.get("category").asText()).isEqualTo("data");
    }

    @Test
    void bd01_bd02_saves_the_configuration_privately_and_never_returns_the_password() throws IOException {
        JsonNode empty = TestApi.json(api.get(BASE + "/config"));
        assertThat(empty.get("workDir").isNull()).isTrue();
        assertThat(empty.get("rootPasswordSet").asBoolean()).isFalse();

        HttpResponse<String> saved = api.put(BASE + "/config", body(config).toString());
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain(Fixtures.PASSWORD);
        HttpResponse<String> read = api.get(BASE + "/config");
        assertThat(read.body()).doesNotContain(Fixtures.PASSWORD).doesNotContain("rootPassword\"");
        JsonNode view = TestApi.json(read);
        assertThat(view.get("rootPasswordSet").asBoolean()).isTrue();
        assertThat(view.get("s3Path").asText()).isEqualTo("s3://bucket-de-prueba/volcados");
        assertThat(view.get("missing").get("import")).isEmpty();

        Path file = dir.resolve("config/apps/database/config.json");
        assertThat(Files.readString(file)).contains(Fixtures.PASSWORD);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }

        // Guardar sin contraseña la conserva.
        ObjectNode again = body(config).put("databaseName", "otra");
        again.remove("rootPassword");
        assertThat(api.put(BASE + "/config", again.toString()).statusCode()).isEqualTo(200);
        assertThat(Files.readString(file)).contains(Fixtures.PASSWORD).contains("\"otra\"");
    }

    @Test
    void bd01_a_badly_formatted_value_is_a_400_that_names_its_field_and_saves_nothing() {
        HttpResponse<String> r = api.put(BASE + "/config", body(config).put("mysqlImage", "--privileged").toString());
        assertError(r, 400, "invalid_config");
        assertThat(TestApi.json(r).get("details").get("field").asText()).isEqualTo("mysqlImage");
        assertThat(TestApi.json(r).get("message").asText()).startsWith("«Imagen de MySQL»");
        assertThat(TestApi.json(api.get(BASE + "/config")).get("workDir").isNull()).isTrue();
        assertError(api.put(BASE + "/config", "esto no es JSON"), 400, "invalid_json");
        assertError(api.put(BASE + "/config", "[]"), 400, "invalid_config");
    }

    @Test
    void bd03_a_step_that_is_not_configured_is_rejected_saying_what_is_missing() {
        HttpResponse<String> r = startJob("{\"branch\": \"hotfix\", \"download\": {\"mode\": \"chunked\"}}");
        assertError(r, 409, "not_configured");
        assertThat(TestApi.json(r).get("details").get("step").asText()).isEqualTo("download");
        assertThat(TestApi.json(r).get("details").get("missing")).extracting(JsonNode::asText)
                .containsExactly("workDir", "s3Path", "s3Suffix", "localSuffix");
        assertError(startJob("{\"branch\": \"hotfix\", \"import\": {}}"), 409, "not_configured");
        assertError(startJob("{\"branch\": \"hotfix\", \"scripts\": {}}"), 409, "not_configured");
        assertError(api.get(BASE + "/dumps"), 409, "not_configured");
        assertError(api.get(BASE + "/scripts"), 409, "not_configured");
        assertThat(commands.commands).isEmpty();
        assertThat(job(0).isNull()).isTrue();
    }

    // --- Trabajos ---

    @Test
    void bd13_without_any_job_there_is_nothing_to_show_or_to_cancel() {
        assertThat(TestApi.json(api.get(BASE + "/job")).get("job").isNull()).isTrue();
        assertError(api.post(BASE + "/job/cancel", null), 409, "no_job");
        assertError(api.get(BASE + "/job?after=x"), 400, "invalid_request");
    }

    @Test
    void bd10_bd13_a_full_job_downloads_imports_and_runs_the_scripts_in_that_order() throws Exception {
        configure();
        JsonNode job = run(FULL_JOB);
        assertThat(job.get("state").asText()).isEqualTo("succeeded");
        assertThat(job.get("branch").asText()).isEqualTo("hotfix");
        assertThat(job.get("id").asLong()).isEqualTo(1);
        assertThat(job.get("startedAt").asText()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z");
        assertThat(job.get("finishedAt").asText()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z");
        assertThat(stepStates(job)).containsExactly("download:done", "import:done", "scripts:done");
        assertThat(job.get("steps").get(2).get("scripts")).extracting(s -> s.get("file").asText() + ":" + s.get("state").asText())
                .containsExactly("TAREA-1.sql:ok", "TAREA-2.sql:ok");
        assertThat(job.get("steps").get(2).get("message").asText()).isEqualTo("2 scripts ejecutados");

        // Descarga: el volcado está en su sitio; importación: se extrajo ese fichero; scripts: en la base configurada.
        Path current = work.resolve("BBDD_hotfix_local.tar.gz");
        assertThat(Files.readString(current)).isEqualTo("volcado de hotfix del martes");
        List<String> programs = commands.commands.stream().map(c -> c.program() + " " + c.args().get(1)).distinct().toList();
        assertThat(programs).containsExactly("aws s3api", "aws s3", "docker stop", "docker rm", "docker volume", "docker run",
                "docker start", "docker exec");
        assertThat(commands.commands).anySatisfy(c -> assertThat(c.args()).contains(current.toAbsolutePath() + ":/dump.tar.gz:ro"));
        assertThat(commands.executedSql).containsExactly("-: CREATE USER demo;", "-: RENAME demo;", "demo: UPDATE a;", "demo: UPDATE b;");
        assertThat(sleeper.sleeps).hasSize(2);
    }

    @Test
    void bd14_bd16_the_log_has_the_commands_and_their_output_but_never_the_password() throws Exception {
        configure();
        JsonNode job = run(FULL_JOB);
        List<String> log = lines(job);
        assertThat(log).contains("$ docker stop mysql-de-prueba", "$ docker volume create mysql-de-prueba-data",
                "Volcado de hotfix descargado");
        assertThat(log).anyMatch(l -> l.startsWith("$ aws s3api head-object --bucket bucket-de-prueba"));
        assertThat(log).anyMatch(l -> l.startsWith("$ docker exec -i -e MYSQL_PWD mysql-de-prueba mysql"));
        assertThat(log).contains("0123456789ab");
        assertThat(api.get(BASE + "/job").body()).doesNotContain(Fixtures.PASSWORD);
        assertThat(commands.commands).allSatisfy(c -> assertThat(c.line()).doesNotContain(Fixtures.PASSWORD));
    }

    @Test
    void bd14_the_log_can_be_read_from_a_given_line() throws Exception {
        configure();
        JsonNode all = run("{\"branch\": \"hotfix\", \"scripts\": {}}").get("log");
        long next = all.get("next").asLong();
        assertThat(all.get("from").asLong()).isZero();
        assertThat(all.get("lines")).hasSize((int) next);
        JsonNode tail = job(next - 2).get("log");
        assertThat(tail.get("from").asLong()).isEqualTo(next - 2);
        assertThat(tail.get("next").asLong()).isEqualTo(next);
        assertThat(tail.get("lines")).hasSize(2);
        assertThat(tail.get("lines").get(1)).isEqualTo(all.get("lines").get((int) next - 1));
        assertThat(job(next).get("log").get("lines")).isEmpty();
        assertThat(job(next + 50).get("log").get("from").asLong()).isEqualTo(next);
    }

    @Test
    void bd14_the_log_keeps_only_the_last_lines() {
        JobLog log = new JobLog();
        for (int i = 0; i < JobLog.MAX_LINES + 10; i++) {
            log.add("línea " + i);
        }
        log.add("x".repeat(JobLog.MAX_CHARS + 500));
        JobLog.Slice all = log.after(0);
        assertThat(JobLog.MAX_LINES).isEqualTo(5000);
        assertThat(JobLog.MAX_CHARS).isEqualTo(2000);
        assertThat(all.lines()).hasSize(JobLog.MAX_LINES);
        assertThat(all.from()).isEqualTo(11);
        assertThat(all.next()).isEqualTo(JobLog.MAX_LINES + 11);
        assertThat(all.lines().get(0)).isEqualTo("línea 11");
        assertThat(all.lines().get(JobLog.MAX_LINES - 1)).hasSize(JobLog.MAX_CHARS + 1).endsWith("…");
        assertThat(log.after(all.next() - 1).lines()).hasSize(1);
    }

    @Test
    void bd10_bd04_bd36_p20_while_a_job_runs_nothing_else_can_start_or_change() throws Exception {
        configure();
        Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "volcado del lunes", MONDAY);
        holdAt("head-object");
        assertThat(startJob(FULL_JOB).statusCode()).isEqualTo(202);
        awaitHeld();

        JsonNode running = job(0);
        assertThat(running.get("state").asText()).isEqualTo("running");
        assertThat(running.get("finishedAt").isNull()).isTrue();
        assertThat(stepStates(running)).containsExactly("download:running", "import:pending", "scripts:pending");
        assertThat(running.get("steps").get(2).get("scripts")).extracting(s -> s.get("state").asText())
                .containsExactly("pending", "pending");

        assertError(startJob(FULL_JOB), 409, "job_running");
        assertError(api.put(BASE + "/config", body(config).toString()), 409, "job_running");
        assertError(api.post(BASE + "/dumps/keep", "{\"branch\": \"hotfix\", \"source\": \"current\", \"name\": \"base\"}"), 409,
                "job_running");
        assertError(api.send("DELETE", BASE + "/dumps/hotfix/auto-20261102-080000.tar.gz", null), 409, "job_running");
        // P-20: la mini app se declara ocupada.
        assertThat(app.busy()).contains("hay un trabajo en marcha");
        assertThat(registry.busy()).isEqualTo("«Base de datos» está ocupada: hay un trabajo en marcha");

        commands.release.countDown();
        assertThat(finished().get("state").asText()).isEqualTo("succeeded");
        assertThat(app.busy()).isEmpty();
        assertThat(registry.busy()).isNull();
        // El siguiente trabajo sustituye al anterior.
        assertThat(run("{\"branch\": \"hotfix\", \"scripts\": {}}").get("id").asLong()).isEqualTo(2);
    }

    @Test
    void bd15_cancelling_ends_the_command_and_keeps_what_was_downloaded() throws Exception {
        configure();
        commands.put(Fixtures.s3Key(Branch.HOTFIX), "x".repeat(40), WEDNESDAY);
        Path current = Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "volcado del lunes", MONDAY);
        Path part = work.resolve("BBDD_hotfix_local.tar.gz.part");
        Files.writeString(part, "x".repeat(10));
        Files.writeString(work.resolve("BBDD_hotfix_local.tar.gz.part.json"),
                "{\"etag\": " + JSON.writeValueAsString(commands.objects.get(Fixtures.s3Key(Branch.HOTFIX)).etag()) + ", \"size\": 40}");
        holdAt("get-object");
        startJob(FULL_JOB);
        awaitHeld();

        assertThat(api.post(BASE + "/job/cancel", null).statusCode()).isEqualTo(200);
        JsonNode job = finished();
        assertThat(job.get("state").asText()).isEqualTo("cancelled");
        assertThat(stepStates(job)).containsExactly("download:failed", "import:skipped", "scripts:skipped");
        assertThat(job.get("steps").get(0).get("message").asText()).isEqualTo("Cancelado");
        assertThat(lines(job)).last().isEqualTo("Trabajo cancelado");
        assertThat(Files.readString(part)).as("la descarga a medias se conserva").isEqualTo("x".repeat(10));
        assertThat(Files.readString(current)).isEqualTo("volcado del lunes");
        // Ni Docker ni notificación (BD-17).
        assertThat(commands.commands).allSatisfy(c -> assertThat(c.program()).isEqualTo("aws"));
        assertThat(notifications).isEmpty();
        assertError(api.post(BASE + "/job/cancel", null), 409, "no_job");
        assertThat(app.busy()).isEmpty();
    }

    @Test
    void bd18_shutting_down_cancels_the_running_job() throws Exception {
        configure();
        holdAt("head-object");
        startJob(FULL_JOB);
        awaitHeld();
        registry.close();
        assertThat(app.busy()).isEmpty();
        assertThat(commands.commands).hasSize(1);
        assertThat(registry.busy()).isNull();
    }

    @Test
    void bd11_bd21_with_both_branches_only_the_download_is_allowed_and_hotfix_goes_first() throws Exception {
        configure();
        assertError(startJob("{\"branch\": \"both\", \"download\": {}, \"import\": {}}"), 400, "invalid_request");
        assertError(startJob("{\"branch\": \"both\", \"download\": {}, \"scripts\": {}}"), 400, "invalid_request");
        assertError(startJob("{\"branch\": \"both\", \"scripts\": {}}"), 400, "invalid_request");

        JsonNode job = run("{\"branch\": \"both\", \"download\": {\"mode\": \"direct\"}}");
        assertThat(job.get("state").asText()).isEqualTo("succeeded");
        assertThat(job.get("branch").asText()).isEqualTo("both");
        assertThat(stepStates(job)).containsExactly("download:done");
        assertThat(Files.readString(work.resolve("BBDD_hotfix_local.tar.gz"))).isEqualTo("volcado de hotfix del martes");
        assertThat(Files.readString(work.resolve("BBDD_develop_local.tar.gz"))).isEqualTo("volcado de develop del martes");
        List<String> copies = commands.lines("aws").stream().filter(l -> l.contains(" s3 cp ") && l.contains("BBDD_")).toList();
        assertThat(copies).hasSize(2);
        assertThat(copies.get(0)).contains("BBDD_hotfix_remoto.tar.gz");
        assertThat(copies.get(1)).contains("BBDD_develop_remoto.tar.gz");
    }

    @Test
    void bd10_bd37_bd53_a_request_that_is_not_valid_starts_nothing() {
        configure();
        for (String body : List.of(
                "{}",
                "{\"branch\": \"hotfix\"}",
                "{\"branch\": \"master\", \"download\": {}}",
                "{\"branch\": \"hotfix\", \"download\": {\"mode\": \"torrent\"}}",
                "{\"branch\": \"hotfix\", \"import\": {\"dump\": \"../BBDD_develop_local.tar.gz\"}}",
                "{\"branch\": \"hotfix\", \"import\": {\"dump\": \"BBDD_hotfix_local.tar.gz\"}}",
                "{\"branch\": \"hotfix\", \"scripts\": {\"version\": \"..\"}}",
                "{\"branch\": \"hotfix\", \"scripts\": {\"version\": \"9.9.9\"}}",
                "{\"branch\": \"hotfix\", \"scripts\": {\"files\": [\"../inicial.sql\"]}}",
                "{\"branch\": \"hotfix\", \"scripts\": {\"files\": [\"no-existe.sql\"]}}")) {
            assertError(startJob(body), 400, "invalid_request");
        }
        assertError(startJob("no es JSON"), 400, "invalid_json");
        assertThat(commands.commands).isEmpty();
        assertThat(job(0).isNull()).isTrue();
    }

    @Test
    void bd12_a_step_that_fails_leaves_the_following_ones_skipped() throws Exception {
        configure();
        Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "volcado del lunes", MONDAY);
        commands.objects.remove(Fixtures.s3Key(Branch.HOTFIX));
        JsonNode job = run(FULL_JOB);
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(stepStates(job)).containsExactly("download:failed", "import:skipped", "scripts:skipped");
        assertThat(job.get("steps").get(0).get("message").asText()).startsWith("No se pudo descargar: volcado de hotfix");
        assertThat(lines(job)).anyMatch(l -> l.startsWith("ERROR: No se pudo descargar"));
        // No se importa el volcado antiguo sin que el usuario lo sepa.
        assertThat(commands.lines("docker")).isEmpty();
        assertThat(commands.executedSql).isEmpty();
    }

    @Test
    void bd12_a_failed_import_does_not_run_the_scripts() throws Exception {
        configure();
        commands.failing = c -> c.args().contains("--volumes-from");
        JsonNode job = run(FULL_JOB);
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(stepStates(job)).containsExactly("download:done", "import:failed", "scripts:skipped");
        assertThat(job.get("steps").get(1).get("message").asText()).isEqualTo("No se pudo extraer el volcado (código 1)");
        assertThat(commands.executedSql).isEmpty();
    }

    @Test
    void bd52_a_script_that_fails_does_not_stop_the_others_but_the_job_ends_as_failed() throws Exception {
        configure();
        Files.writeString(pending.resolve("TAREA-1.sql"), "FALLA;");
        JsonNode job = run("{\"branch\": \"hotfix\", \"scripts\": {\"version\": null, \"files\": null}}");
        assertThat(job.get("state").asText()).isEqualTo("failed");
        JsonNode step = job.get("steps").get(0);
        assertThat(step.get("state").asText()).isEqualTo("failed");
        assertThat(step.get("message").asText()).isEqualTo("Falló 1 script de 2");
        assertThat(step.get("scripts").get(0).get("state").asText()).isEqualTo("error");
        assertThat(step.get("scripts").get(0).get("error").asText()).startsWith("ERROR 1064");
        assertThat(step.get("scripts").get(1).get("state").asText()).isEqualTo("ok");
        assertThat(step.get("scripts").get(1).get("error").isNull()).isTrue();
        assertThat(commands.executedSql).containsExactly("demo: FALLA;", "demo: UPDATE b;");
    }

    @Test
    void bd51_runs_the_chosen_scripts_of_a_version() throws Exception {
        configure();
        Path version = Files.createDirectories(Path.of(config.versionsSqlDir()).resolve("1.10.0"));
        Files.writeString(version.resolve("TAREA-7.sql"), "INSERT x;");
        Files.writeString(version.resolve("TAREA-8.sql"), "INSERT y;");
        JsonNode job = run("{\"branch\": \"develop\", \"scripts\": {\"version\": \"1.10.0\", \"files\": [\"TAREA-8.sql\"]}}");
        assertThat(job.get("state").asText()).isEqualTo("succeeded");
        assertThat(job.get("steps").get(0).get("message").asText()).isEqualTo("1 script ejecutado");
        assertThat(commands.executedSql).containsExactly("demo: INSERT y;");
    }

    @Test
    void bd54_a_folder_without_scripts_ends_well_and_one_that_does_not_exist_fails() throws Exception {
        configure();
        Files.delete(pending.resolve("TAREA-1.sql"));
        Files.delete(pending.resolve("TAREA-2.sql"));
        JsonNode empty = run("{\"branch\": \"hotfix\", \"scripts\": {}}");
        assertThat(empty.get("state").asText()).isEqualTo("succeeded");
        assertThat(empty.get("steps").get(0).get("message").asText()).isEqualTo("No hay scripts que ejecutar");

        Files.delete(pending);
        JsonNode missing = run("{\"branch\": \"hotfix\", \"scripts\": {}}");
        assertThat(missing.get("state").asText()).isEqualTo("failed");
        assertThat(missing.get("steps").get(0).get("message").asText()).isEqualTo("La carpeta " + pending + " no existe");
        assertThat(commands.lines("docker")).isEmpty();
    }

    @Test
    void bd40_imports_the_chosen_copy_of_the_branch() throws Exception {
        configure();
        Path copy = Fixtures.write(work.resolve("backups/develop/kept-20261102-080000-base buena.tar.gz"), "lunes", MONDAY);
        JsonNode job = run("{\"branch\": \"develop\", \"import\": {\"dump\": \"kept-20261102-080000-base buena.tar.gz\"}}");
        assertThat(job.get("state").asText()).isEqualTo("succeeded");
        assertThat(commands.commands).anySatisfy(c -> assertThat(c.args()).contains(copy.toAbsolutePath() + ":/dump.tar.gz:ro"));

        // BD-40: sin volcado actual, falla sin tocar Docker.
        commands.commands.clear();
        JsonNode none = run("{\"branch\": \"hotfix\", \"import\": {}}");
        assertThat(none.get("state").asText()).isEqualTo("failed");
        assertThat(none.get("steps").get(0).get("message").asText()).isEqualTo("El volcado BBDD_hotfix_local.tar.gz no existe");
        assertThat(commands.lines("docker")).isEmpty();
    }

    @Test
    void bd17_p21_the_end_of_a_job_is_a_platform_notification_that_leads_to_prepare() throws Exception {
        configure();
        run("{\"branch\": \"hotfix\", \"scripts\": {}}");
        awaitNotifications(1);
        assertThat(notifications).containsExactly("success|El trabajo ha terminado correctamente|null|/");

        Files.writeString(pending.resolve("TAREA-1.sql"), "FALLA;");
        run("{\"branch\": \"hotfix\", \"scripts\": {}}");
        awaitNotifications(2);
        assertThat(notifications.get(1)).isEqualTo("error|El trabajo ha terminado con errores|null|/");
        // P-24: el sonido y la notificación de escritorio son cosa del shell.
        assertThat(commands.commands).noneMatch(c -> c.program().equals("notify-send") || c.program().equals("paplay"));
    }

    @Test
    void bd19_a_missing_command_fails_the_step_and_says_which() throws Exception {
        configure();
        commands.missing.add("docker");
        JsonNode job = run("{\"branch\": \"hotfix\", \"scripts\": {}}");
        assertThat(job.get("state").asText()).isEqualTo("failed");
        assertThat(job.get("steps").get(0).get("message").asText()).isEqualTo("No se encontró el comando «docker»");
    }

    // --- Copias y scripts ---

    @Test
    void bd31_bd35_three_downloads_leave_the_current_dump_and_only_the_previous_one() throws Exception {
        configure();
        String download = "{\"branch\": \"hotfix\", \"download\": {\"mode\": \"chunked\", \"force\": false}}";
        commands.put(Fixtures.s3Key(Branch.HOTFIX), "lunes", MONDAY);
        run(download);
        commands.put(Fixtures.s3Key(Branch.HOTFIX), "martes", TUESDAY);
        run(download);
        JsonNode two = dumps("hotfix");
        assertThat(two.get("current").get("modified").asText()).isEqualTo("2026-11-03T08:30:00Z");
        assertThat(two.get("current").get("size").asLong()).isEqualTo(6);
        assertThat(two.get("previous").get("file").asText()).isEqualTo("auto-20261102-080000.tar.gz");
        assertThat(two.get("kept")).isEmpty();
        assertThat(two.get("partial").isNull()).isTrue();
        assertThat(dumps("develop").get("current").isNull()).isTrue();

        // BD-22: el mismo volcado no rota.
        run(download);
        assertThat(dumps("hotfix").get("previous").get("file").asText()).isEqualTo("auto-20261102-080000.tar.gz");

        commands.put(Fixtures.s3Key(Branch.HOTFIX), "miércoles", WEDNESDAY);
        run(download);
        JsonNode three = dumps("hotfix");
        assertThat(three.get("current").get("modified").asText()).isEqualTo("2026-11-04T09:15:00Z");
        assertThat(three.get("previous").get("file").asText()).isEqualTo("auto-20261103-083000.tar.gz");
        assertThat(work.resolve("backups/hotfix/auto-20261102-080000.tar.gz")).doesNotExist();
    }

    @Test
    void bd32_bd34_keeps_and_deletes_copies_through_the_api() throws Exception {
        configure();
        Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "martes", TUESDAY);
        Fixtures.write(work.resolve("backups/hotfix/auto-20261102-080000.tar.gz"), "lunes", MONDAY);

        HttpResponse<String> kept = api.post(BASE + "/dumps/keep",
                "{\"branch\": \"hotfix\", \"source\": \"auto-20261102-080000.tar.gz\", \"name\": \"lunes bueno\"}");
        assertThat(kept.statusCode()).as(kept.body()).isEqualTo(201);
        assertThat(TestApi.json(kept).get("file").asText()).isEqualTo("kept-20261102-080000-lunes bueno.tar.gz");
        assertThat(TestApi.json(kept).get("kind").asText()).isEqualTo("kept");
        assertError(api.post(BASE + "/dumps/keep", "{\"branch\": \"hotfix\", \"source\": \"current\", \"name\": \"LUNES BUENO\"}"),
                409, "name_taken");
        assertError(api.post(BASE + "/dumps/keep", "{\"branch\": \"hotfix\", \"source\": \"current\", \"name\": \"..\"}"), 400,
                "invalid_name");
        assertError(api.post(BASE + "/dumps/keep", "{\"branch\": \"master\", \"source\": \"current\", \"name\": \"x\"}"), 400,
                "invalid_request");
        assertError(api.post(BASE + "/dumps/keep", "{\"branch\": \"develop\", \"source\": \"current\", \"name\": \"x\"}"), 404,
                "dump_not_found");
        assertThat(dumps("hotfix").get("kept")).extracting(d -> d.get("name").asText()).containsExactly("lunes bueno");

        String path = BASE + "/dumps/hotfix/" + encode("kept-20261102-080000-lunes bueno.tar.gz");
        assertThat(api.send("DELETE", path, null).statusCode()).isEqualTo(200);
        assertError(api.send("DELETE", path, null), 404, "dump_not_found");
        assertThat(dumps("hotfix").get("kept")).isEmpty();
        assertThat(dumps("hotfix").get("previous").get("file").asText()).isEqualTo("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd34_bd37_the_api_never_deletes_outside_the_copies_of_a_branch() throws Exception {
        configure();
        Path current = Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "martes", TUESDAY);
        Path outside = Fixtures.write(work.resolve("otro.tar.gz"), "fuera", MONDAY);
        for (String file : List.of("current", "BBDD_hotfix_local.tar.gz", "..%2F..%2Fotro.tar.gz", "..%2FBBDD_hotfix_local.tar.gz",
                "otro.tar.gz")) {
            HttpResponse<String> r = api.send("DELETE", BASE + "/dumps/hotfix/" + file, null);
            assertThat(r.statusCode()).as(file + " → " + r.body()).isIn(400, 404);
        }
        assertError(api.send("DELETE", BASE + "/dumps/master/auto-20261102-080000.tar.gz", null), 400, "invalid_request");
        assertThat(current).exists();
        assertThat(outside).exists();
    }

    @Test
    void bd50_lists_the_versions_and_the_scripts_of_a_folder() throws Exception {
        configure();
        Files.createDirectories(Path.of(config.versionsSqlDir()).resolve("1.9.0"));
        Path version = Files.createDirectories(Path.of(config.versionsSqlDir()).resolve("1.10.0"));
        Files.writeString(version.resolve("TAREA-7.sql"), "INSERT x;");

        JsonNode pendingList = TestApi.json(api.get(BASE + "/scripts"));
        assertThat(pendingList.get("version").isNull()).isTrue();
        assertThat(pendingList.get("exists").asBoolean()).isTrue();
        assertThat(pendingList.get("folder").asText()).isEqualTo(pending.toString());
        assertThat(pendingList.get("files")).extracting(JsonNode::asText).containsExactly("TAREA-1.sql", "TAREA-2.sql");
        assertThat(pendingList.get("versions")).extracting(JsonNode::asText).containsExactly("1.10.0", "1.9.0");

        JsonNode versionList = TestApi.json(api.get(BASE + "/scripts?version=1.10.0"));
        assertThat(versionList.get("version").asText()).isEqualTo("1.10.0");
        assertThat(versionList.get("files")).extracting(JsonNode::asText).containsExactly("TAREA-7.sql");
        assertError(api.get(BASE + "/scripts?version=.."), 400, "invalid_request");
        assertError(api.get(BASE + "/scripts?version=9.9.9"), 400, "invalid_request");
    }

    @Test
    void bd20_s3_is_only_contacted_inside_a_job_with_the_download_step() throws Exception {
        configure();
        api.get(BASE + "/config");
        api.get(BASE + "/dumps");
        api.get(BASE + "/scripts");
        api.get(BASE + "/job");
        Fixtures.write(work.resolve("BBDD_hotfix_local.tar.gz"), "volcado del lunes", MONDAY);
        assertThat(run("{\"branch\": \"hotfix\", \"import\": {}, \"scripts\": {}}").get("state").asText()).isEqualTo("succeeded");
        assertThat(commands.lines("aws")).isEmpty();
    }
}
