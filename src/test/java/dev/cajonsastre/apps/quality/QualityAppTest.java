package dev.cajonsastre.apps.quality;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.catalog.CatalogApi;
import dev.cajonsastre.consoles.ConsoleCenter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** La mini app entera por su API, con el servidor real y docker simulado (CD-01 a CD-30, P-20). Datos inventados (S-31). */
class QualityAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/quality";
    private static final String PASSWORD = "clave-secreta-de-prueba";

    @TempDir
    Path dir;
    final FakeDocker docker = new FakeDocker();
    /** CD-26: las notificaciones que emite la mini app, como «tipo|título|texto|subruta». */
    final List<String> notifications = new CopyOnWriteArrayList<>();
    /** CD-25: las consolas que abre la mini app, en el centro de consolas real del shell. */
    final ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
    QualityApp app;
    AppRegistry registry;
    TestApi api;
    Path folder;

    @BeforeEach
    void start() throws IOException {
        app = new QualityApp(docker);
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        registry = AppRegistry.start(new AppCatalog(List.of(app)), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> notifications.add(kind.id() + "|" + title + "|" + text + "|" + path),
                consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
        folder = Files.createDirectories(dir.resolve("calidad"));
        docker.running.add("mysql-de-prueba");
    }

    @AfterEach
    void stop() {
        docker.release.countDown();
        api.close();
        registry.close();
    }

    // --- Ayudas ---

    private ObjectNode config() {
        return JSON.createObjectNode().put("containerName", "mysql-de-prueba").put("rootPassword", PASSWORD)
                .put("databaseName", "demo").put("qualitySqlDir", folder.toString());
    }

    private void configure() {
        HttpResponse<String> r = api.put(BASE + "/config", config().toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
    }

    private void script(String name, String sql) throws IOException {
        Files.writeString(folder.resolve(name), sql);
    }

    private JsonNode current() {
        return TestApi.json(api.get(BASE + "/run")).get("run");
    }

    private JsonNode finished() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
        JsonNode run = current();
        while (run.get("state").asText().equals("running") && System.nanoTime() < deadline) {
            Thread.sleep(20);
            run = current();
        }
        return run;
    }

    private JsonNode run(String body) throws InterruptedException {
        HttpResponse<String> r = api.post(BASE + "/run", body);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(202);
        return finished();
    }

    private List<String> lines(JsonNode run) {
        return consoles.slice(run.get("consoleId").asLong(), 0).lines();
    }

    private static List<String> states(JsonNode run) {
        List<String> out = new ArrayList<>();
        run.get("scripts").forEach(s -> out.add(s.get("file").asText() + ":" + s.get("state").asText()));
        return out;
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    // --- Configuración ---

    @Test
    void cd01_cd02_cd03_saves_the_config_privately_and_the_password_never_leaves_the_server() {
        JsonNode empty = TestApi.json(api.get(BASE + "/config"));
        assertThat(empty.get("rootPasswordSet").asBoolean()).isFalse();
        assertThat(empty.get("missing")).hasSize(4);

        HttpResponse<String> saved = api.put(BASE + "/config", config().toString());
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain(PASSWORD);
        JsonNode view = TestApi.json(api.get(BASE + "/config"));
        assertThat(api.get(BASE + "/config").body()).doesNotContain(PASSWORD).doesNotContain("rootPassword\"");
        assertThat(view.get("rootPasswordSet").asBoolean()).isTrue();
        assertThat(view.get("missing")).isEmpty();
        assertThat(view.get("qualitySqlDir").asText()).isEqualTo(folder.toString());

        Path file = dir.resolve("config/apps/quality/config.json");
        assertThat(file).content().contains(PASSWORD);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(assertPosix(file))).isEqualTo("rw-------");
        }

        // Sin contraseña se conserva; vacía se borra.
        ObjectNode again = config().put("databaseName", "otra");
        again.remove("rootPassword");
        assertThat(api.put(BASE + "/config", again.toString()).statusCode()).isEqualTo(200);
        assertThat(file).content().contains(PASSWORD).contains("\"otra\"");
        assertThat(api.put(BASE + "/config", config().put("rootPassword", "").toString()).statusCode()).isEqualTo(200);
        JsonNode cleared = TestApi.json(api.get(BASE + "/config"));
        assertThat(cleared.get("rootPasswordSet").asBoolean()).isFalse();
        assertThat(cleared.get("missing")).extracting(JsonNode::asText).containsExactly("rootPassword");
    }

    private static java.util.Set<java.nio.file.attribute.PosixFilePermission> assertPosix(Path file) {
        try {
            return Files.getPosixFilePermissions(file);
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }

    @Test
    void cd01_a_badly_formatted_value_is_a_400_that_names_its_field_and_saves_nothing() {
        HttpResponse<String> r = api.put(BASE + "/config", config().put("qualitySqlDir", "relativa/calidad").toString());
        assertError(r, 400, "invalid_config");
        assertThat(TestApi.json(r).get("details").get("field").asText()).isEqualTo("qualitySqlDir");
        assertThat(TestApi.json(r).get("message").asText()).startsWith("«Carpeta de scripts de calidad»");
        assertError(api.put(BASE + "/config", config().put("containerName", "--privileged").toString()), 400, "invalid_config");
        assertThat(TestApi.json(api.get(BASE + "/config")).get("containerName").isNull()).isTrue();
    }

    @Test
    void cd01_saves_half_a_config() {
        assertThat(api.put(BASE + "/config", "{\"containerName\": \"mysql-de-prueba\"}").statusCode()).isEqualTo(200);
        assertThat(TestApi.json(api.get(BASE + "/config")).get("missing")).extracting(JsonNode::asText)
                .containsExactly("rootPassword", "databaseName", "qualitySqlDir");
    }

    @Test
    void cd03_cd10_without_config_nothing_can_be_listed_or_run() {
        assertError(api.get(BASE + "/scripts"), 409, "not_configured");
        assertError(api.post(BASE + "/run", "{\"files\": null}"), 409, "not_configured");
        assertThat(docker.commands).isEmpty();
    }

    // --- Scripts ---

    @Test
    void cd10_lists_the_sql_files_of_the_folder_by_name() throws IOException {
        configure();
        script("b_clientes.sql", "SELECT 1;");
        script("a_pedidos.sql", "SELECT 1;");
        Files.writeString(folder.resolve("notas.txt"), "no es un script");
        Files.createDirectories(folder.resolve("carpeta.sql"));
        JsonNode listing = TestApi.json(api.get(BASE + "/scripts"));
        assertThat(listing.get("exists").asBoolean()).isTrue();
        assertThat(listing.get("files")).extracting(JsonNode::asText).containsExactly("a_pedidos.sql", "b_clientes.sql");

        Files.delete(folder.resolve("notas.txt"));
        Files.delete(folder.resolve("carpeta.sql"));
        Files.delete(folder.resolve("a_pedidos.sql"));
        Files.delete(folder.resolve("b_clientes.sql"));
        Files.delete(folder);
        JsonNode missing = TestApi.json(api.get(BASE + "/scripts"));
        assertThat(missing.get("exists").asBoolean()).isFalse();
        assertThat(missing.get("files")).isEmpty();
    }

    @Test
    void cd11_names_with_paths_or_that_do_not_exist_are_rejected_without_running_anything() throws IOException {
        configure();
        script("a.sql", "SELECT 1;");
        assertError(api.post(BASE + "/run", "{\"files\": [\"../a.sql\"]}"), 400, "invalid_request");
        assertError(api.post(BASE + "/run", "{\"files\": [\"sub\\\\a.sql\"]}"), 400, "invalid_request");
        assertError(api.post(BASE + "/run", "{\"files\": [\"otro.sql\"]}"), 400, "invalid_request");
        assertError(api.post(BASE + "/run", "{\"files\": []}"), 400, "invalid_request");
        assertError(api.get(BASE + "/run/scripts/..%2Fa.sql"), 400, "invalid_request");
        assertThat(docker.commands).isEmpty();
    }

    // --- Comprobación ---

    @Test
    void cd20_cd22_cd23_runs_every_script_in_order_with_xml_and_the_password_in_the_environment() throws Exception {
        configure();
        script("c_falla.sql", "SELECT * FROM FALLA;");
        script("a_correcto.sql", "SELECT 1 FROM dual WHERE 1 = 0;");
        script("b_filas.sql", "FILAS 3");
        script("d_aviso.sql", "AVISO");
        script("e_vacio.sql", "VACIO");
        JsonNode run = run("{\"files\": null}");

        assertThat(run.get("state").asText()).isEqualTo("succeeded");
        assertThat(states(run)).containsExactly("a_correcto.sql:clean", "b_filas.sql:rows", "c_falla.sql:error",
                "d_aviso.sql:error", "e_vacio.sql:clean");
        assertThat(docker.executed()).containsExactly("a_correcto.sql", "b_filas.sql", "c_falla.sql", "d_aviso.sql", "e_vacio.sql");
        assertThat(run.get("scripts").get(1).get("rowCount").asLong()).isEqualTo(3);
        assertThat(run.get("scripts").get(1).get("complete").asBoolean()).isTrue();
        assertThat(run.get("scripts").get(2).get("error").asText()).contains("ERROR 1146");
        assertThat(run.get("scripts").get(3).get("error").asText()).isEqualTo("Aviso simulado");
        assertThat(run.get("message").asText()).isEqualTo("3 de 5 scripts con incidencias: 1 con filas y 2 con error");

        Command exec = docker.commands.stream().filter(c -> c.stdin() != null).findFirst().orElseThrow();
        assertThat(exec.args()).containsExactly("docker", "exec", "-i", "-e", "MYSQL_PWD", "mysql-de-prueba", "mysql",
                "--default-character-set=utf8", "-uroot", "--xml", "demo");
        assertThat(exec.env()).containsEntry("MYSQL_PWD", PASSWORD);
        assertThat(docker.commands).allSatisfy(c -> assertThat(c.args()).noneMatch(a -> a.contains(PASSWORD)));
        assertThat(lines(run)).noneMatch(l -> l.contains(PASSWORD));
    }

    @Test
    void cd20_runs_only_the_chosen_scripts_in_name_order() throws Exception {
        configure();
        script("a.sql", "SELECT 1;");
        script("b.sql", "SELECT 1;");
        script("c.sql", "SELECT 1;");
        JsonNode run = run("{\"files\": [\"c.sql\", \"a.sql\"]}");
        assertThat(states(run)).containsExactly("a.sql:clean", "c.sql:clean");
        assertThat(docker.executed()).containsExactly("a.sql", "c.sql");
    }

    @Test
    void cd21_with_the_container_stopped_no_script_runs_and_the_run_fails() throws Exception {
        configure();
        script("a.sql", "FILAS 1");
        docker.running.clear();
        JsonNode run = run("{\"files\": null}");
        assertThat(run.get("state").asText()).isEqualTo("failed");
        assertThat(run.get("message").asText()).isEqualTo("El contenedor no está levantado: mysql-de-prueba");
        assertThat(docker.executed()).isEmpty();
        assertThat(docker.commands.get(0).args()).containsExactly("docker", "ps", "--format", "{{.Names}}");
        assertThat(notifications).containsExactly(
                "error|No se ha podido comprobar la calidad del dato|El contenedor no está levantado: mysql-de-prueba|/");
        assertThat(consoles.list().get(0).state()).isEqualTo("failed");
    }

    @Test
    void cd21_a_container_whose_name_only_contains_the_configured_one_does_not_count() throws Exception {
        configure();
        script("a.sql", "SELECT 1;");
        docker.running.clear();
        docker.running.add("mysql-de-prueba-2");
        assertThat(run("{\"files\": null}").get("state").asText()).isEqualTo("failed");
    }

    @Test
    void cd21_cd22_docker_failing_or_missing_fails_the_run_and_says_why() throws Exception {
        configure();
        script("a.sql", "SELECT 1;");
        docker.psError = "Cannot connect to the Docker daemon";
        assertThat(run("{\"files\": null}").get("message").asText())
                .isEqualTo("No se ha podido consultar Docker: Cannot connect to the Docker daemon");
        docker.psError = null;
        docker.missing = true;
        JsonNode run = run("{\"files\": null}");
        assertThat(run.get("state").asText()).isEqualTo("failed");
        assertThat(run.get("message").asText()).isEqualTo("No se encontró el comando «docker»");
    }

    @Test
    void cd21_a_missing_folder_fails_and_an_empty_one_ends_well() throws Exception {
        configure();
        JsonNode empty = run("{\"files\": null}");
        assertThat(empty.get("state").asText()).isEqualTo("succeeded");
        assertThat(empty.get("message").asText()).isEqualTo("No hay scripts de calidad");
        assertThat(docker.commands).isEmpty();

        Files.delete(folder);
        JsonNode missing = run("{\"files\": null}");
        assertThat(missing.get("state").asText()).isEqualTo("failed");
        assertThat(missing.get("message").asText()).isEqualTo("La carpeta " + folder + " no existe");
    }

    @Test
    void cd24_cd29_the_rows_of_a_script_are_kept_up_to_1000_with_their_columns() throws Exception {
        configure();
        script("filas.sql", "FILAS 1200");
        script("correcto.sql", "SELECT 1;");
        JsonNode run = run("{\"files\": null}");
        JsonNode filas = run.get("scripts").get(1);
        assertThat(filas.get("rowCount").asLong()).isEqualTo(1200);

        JsonNode tables = TestApi.json(api.get(BASE + "/run/scripts/filas.sql"));
        assertThat(tables.get("rowCount").asLong()).isEqualTo(1200);
        JsonNode table = tables.get("tables").get(0);
        assertThat(table.get("columns")).extracting(JsonNode::asText).containsExactly("id", "nombre");
        assertThat(table.get("rows")).hasSize(1000);
        assertThat(table.get("rows").get(0)).extracting(JsonNode::asText).containsExactly("1", "Cliente 1");
        assertThat(table.get("rows").get(1).get(1).isNull()).isTrue();

        assertError(api.get(BASE + "/run/scripts/correcto.sql"), 404, "result_not_found");
        assertError(api.get(BASE + "/run/scripts/otro.sql"), 404, "result_not_found");
    }

    @Test
    void cd23_an_output_that_is_not_xml_is_an_error() throws Exception {
        configure();
        script("raro.sql", "XML:id\tnombre\n1\tAna");
        JsonNode run = run("{\"files\": null}");
        assertThat(states(run)).containsExactly("raro.sql:error");
        assertThat(run.get("scripts").get(0).get("error").asText()).isEqualTo("No se ha podido leer la salida de mysql");
    }

    @Test
    void cd25_cd26_a_run_with_incidents_writes_them_in_its_console_and_notifies_them() throws Exception {
        configure();
        script("a_filas.sql", "FILAS 2");
        script("b_falla.sql", "FALLA");
        script("c_bien.sql", "SELECT 1;");
        JsonNode run = run("{\"files\": null}");
        List<String> lines = lines(run);
        assertThat(consoles.list().get(0).name()).isEqualTo("Comprobación 1");
        assertThat(consoles.list().get(0).state()).isEqualTo("failed");
        assertThat(lines).contains("$ docker ps --format {{.Names}}", "## a_filas.sql", "id\tnombre", "1\tCliente 1", "2\tNULL",
                "## b_falla.sql", "ERROR 1146 (42S02) at line 1: Table 'demo.inexistente' doesn't exist",
                "2 de 3 scripts con incidencias: 1 con filas y 1 con error");
        assertThat(lines).doesNotContain("## c_bien.sql");
        assertThat(lines).anyMatch(l -> l.startsWith("$ docker exec -i -e MYSQL_PWD mysql-de-prueba mysql") && l.endsWith("c_bien.sql"));
        assertThat(notifications).containsExactly("error|2 scripts con incidencias|1 con filas y 1 con error|/");
    }

    @Test
    void cd25_cd26_a_clean_run_ends_its_console_well_and_says_so() throws Exception {
        configure();
        script("a.sql", "SELECT 1;");
        JsonNode run = run("{\"files\": null}");
        assertThat(run.get("message").asText()).isEqualTo("La base de datos tiene correctamente todos sus datos");
        assertThat(consoles.list().get(0).state()).isEqualTo("succeeded");
        assertThat(lines(run)).endsWith("La base de datos tiene correctamente todos sus datos");
        assertThat(notifications).containsExactly("success|La base de datos tiene correctamente todos sus datos|null|/");
    }

    @Test
    void cd26_a_single_incident_is_singular() throws Exception {
        configure();
        script("a.sql", "FILAS 1");
        run("{\"files\": null}");
        assertThat(notifications).containsExactly("error|1 script con incidencias|1 con filas y 0 con error|/");
    }

    @Test
    void cd20_cd27_p20_a_second_run_is_409_cancel_stops_it_and_the_app_is_busy_meanwhile() throws Exception {
        configure();
        script("a.sql", "FILAS 1");
        script("b.sql", "SELECT 1;");
        script("c.sql", "SELECT 1;");
        docker.blocking = "b.sql";
        assertThat(api.post(BASE + "/run", "{\"files\": null}").statusCode()).isEqualTo(202);
        assertThat(docker.blocked.await(10, TimeUnit.SECONDS)).isTrue();

        assertError(api.post(BASE + "/run", "{\"files\": null}"), 409, "run_running");
        assertError(api.put(BASE + "/config", config().toString()), 409, "run_running");
        assertThat(app.busy()).contains("hay una comprobación en marcha");
        assertThat(consoles.list().get(0).state()).isEqualTo("running");

        assertThat(api.post(BASE + "/run/cancel", null).statusCode()).isEqualTo(200);
        JsonNode run = finished();
        assertThat(run.get("state").asText()).isEqualTo("cancelled");
        assertThat(states(run)).containsExactly("a.sql:rows", "b.sql:pending", "c.sql:pending");
        assertThat(consoles.list().get(0).state()).isEqualTo("cancelled");
        assertThat(notifications).isEmpty();
        assertThat(app.busy()).isEmpty();
        assertError(api.post(BASE + "/run/cancel", null), 409, "no_run");
    }

    @Test
    void cd27_stopping_the_app_cancels_the_run() throws Exception {
        configure();
        script("a.sql", "SELECT 1;");
        docker.blocking = "a.sql";
        assertThat(api.post(BASE + "/run", "{\"files\": null}").statusCode()).isEqualTo(202);
        assertThat(docker.blocked.await(10, TimeUnit.SECONDS)).isTrue();
        app.stop();
        assertThat(app.busy()).isEmpty();
        assertThat(consoles.list().get(0).state()).isEqualTo("cancelled");
    }

    @Test
    void cd28_cd30_without_runs_there_is_nothing_and_a_new_run_replaces_the_last_one() throws Exception {
        assertThat(current().isNull()).isTrue();
        assertError(api.post(BASE + "/run/cancel", null), 409, "no_run");
        configure();
        script("a.sql", "FILAS 1");
        JsonNode first = run("{\"files\": null}");
        assertThat(first.get("id").asLong()).isEqualTo(1);
        assertThat(first.get("startedAt").asText()).isNotEmpty();
        assertThat(first.get("finishedAt").asText()).isNotEmpty();
        assertThat(api.get(BASE + "/run/scripts/a.sql").statusCode()).isEqualTo(200);

        script("a.sql", "SELECT 1;");
        JsonNode second = run("{\"files\": null}");
        assertThat(second.get("id").asLong()).isEqualTo(2);
        assertThat(states(second)).containsExactly("a.sql:clean");
        assertError(api.get(BASE + "/run/scripts/a.sql"), 404, "result_not_found");
        // CD-30: nada en disco salvo la configuración.
        if (Files.isDirectory(dir.resolve("data"))) {
            try (var files = Files.walk(dir.resolve("data"))) {
                assertThat(files.filter(Files::isRegularFile).toList()).isEmpty();
            }
        }
    }
}
