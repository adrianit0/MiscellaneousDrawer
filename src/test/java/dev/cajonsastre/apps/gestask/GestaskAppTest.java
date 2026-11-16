package dev.cajonsastre.apps.gestask;

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
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La mini app entera por su API, con el servidor real y Supabase simulado (GT-01 a GT-17). Ninguna prueba contacta con
 * un servidor. Datos inventados (S-31).
 */
class GestaskAppTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String BASE = "/api/apps/gestask";
    private static final String URL = "https://proyecto-de-prueba.supabase.example";
    private static final String KEY = "clave-publicable-de-prueba";
    private static final String EMAIL = "persona@example.test";
    private static final String PASSWORD = "clave-secreta-de-prueba";

    @TempDir
    Path dir;
    final FakeSupabase supabase = new FakeSupabase();
    AppRegistry registry;
    TestApi api;

    @BeforeEach
    void start() {
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("data/backups"));
        ConsoleCenter consoles = new ConsoleCenter(Clock.systemUTC(), id -> true);
        registry = AppRegistry.start(new AppCatalog(List.of(new GestaskApp(supabase))), paths, Clock.systemUTC(),
                manifest -> (title, text, kind, path) -> { }, consoles::forApp);
        api = TestApi.start(List.of(new CatalogApi(registry), registry));
    }

    @AfterEach
    void stop() {
        api.close();
        registry.close();
    }

    // --- Ayudas ---

    private static ObjectNode config() {
        return JSON.createObjectNode().put("supabaseUrl", URL).put("publishableKey", KEY).put("email", EMAIL)
                .put("password", PASSWORD);
    }

    private void configure() {
        HttpResponse<String> r = api.put(BASE + "/config", config().toString());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
    }

    private static void assertError(HttpResponse<String> r, int status, String code) {
        assertThat(r.statusCode()).as(r.body()).isEqualTo(status);
        assertThat(TestApi.json(r).get("code").asText()).isEqualTo(code);
    }

    // --- Conexión ---

    @Test
    void gt01_gt02_gt03_saves_the_connection_privately_and_the_password_never_leaves_the_server() throws IOException {
        JsonNode empty = TestApi.json(api.get(BASE + "/config"));
        assertThat(empty.get("passwordSet").asBoolean()).isFalse();
        assertThat(empty.get("missing")).hasSize(4);

        HttpResponse<String> saved = api.put(BASE + "/config", config().put("supabaseUrl", URL + "/").toString());
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(saved.body()).doesNotContain(PASSWORD);
        String body = api.get(BASE + "/config").body();
        assertThat(body).doesNotContain(PASSWORD).doesNotContain("password\"");
        JsonNode view = TestApi.json(api.get(BASE + "/config"));
        assertThat(view.get("passwordSet").asBoolean()).isTrue();
        assertThat(view.get("missing")).isEmpty();
        // GT-01: la barra final se quita.
        assertThat(view.get("supabaseUrl").asText()).isEqualTo(URL);
        assertThat(view.get("email").asText()).isEqualTo(EMAIL);

        Path file = dir.resolve("config/apps/gestask/config.json");
        assertThat(file).content().contains(PASSWORD);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }

        // Sin contraseña se conserva; vacía se borra.
        ObjectNode again = config().put("email", "otra@example.test");
        again.remove("password");
        assertThat(api.put(BASE + "/config", again.toString()).statusCode()).isEqualTo(200);
        assertThat(file).content().contains(PASSWORD).contains("otra@example.test");
        assertThat(api.put(BASE + "/config", config().put("password", "").toString()).statusCode()).isEqualTo(200);
        JsonNode cleared = TestApi.json(api.get(BASE + "/config"));
        assertThat(cleared.get("passwordSet").asBoolean()).isFalse();
        assertThat(cleared.get("missing")).extracting(JsonNode::asText).containsExactly("password");
        // Guardar no contacta con nadie.
        assertThat(supabase.requests).isEmpty();
    }

    @Test
    void gt01_saves_half_a_connection() {
        assertThat(api.put(BASE + "/config", "{\"email\": \"" + EMAIL + "\"}").statusCode()).isEqualTo(200);
        assertThat(TestApi.json(api.get(BASE + "/config")).get("missing")).extracting(JsonNode::asText)
                .containsExactly("supabaseUrl", "publishableKey", "password");
    }

    @Test
    void gt04_a_badly_formatted_value_is_a_400_that_names_its_field_and_saves_nothing() {
        for (String url : List.of("http://proyecto.supabase.example", "https://proyecto.example/functions",
                "https://proyecto.example?x=1", "https://usuario:clave@proyecto.example", "ftp://proyecto.example",
                "proyecto.example", "https://" + "a".repeat(200) + ".example")) {
            HttpResponse<String> r = api.put(BASE + "/config", config().put("supabaseUrl", url).toString());
            assertError(r, 400, "invalid_config");
            assertThat(TestApi.json(r).get("details").get("field").asText()).as(url).isEqualTo("supabaseUrl");
            assertThat(TestApi.json(r).get("message").asText()).startsWith("«URL de Supabase»");
        }
        HttpResponse<String> key = api.put(BASE + "/config", config().put("publishableKey", "con espacios").toString());
        assertThat(TestApi.json(key).get("details").get("field").asText()).isEqualTo("publishableKey");
        HttpResponse<String> email = api.put(BASE + "/config", config().put("email", "sin-arroba").toString());
        assertThat(TestApi.json(email).get("details").get("field").asText()).isEqualTo("email");
        HttpResponse<String> password = api.put(BASE + "/config", config().put("password", "x".repeat(201)).toString());
        assertThat(TestApi.json(password).get("details").get("field").asText()).isEqualTo("password");
        assertError(api.put(BASE + "/config", "[]"), 400, "invalid_config");
        assertThat(TestApi.json(api.get(BASE + "/config")).get("supabaseUrl").isNull()).isTrue();
    }

    @Test
    void gt01_accepts_plain_http_only_for_a_local_supabase() {
        assertThat(api.put(BASE + "/config", config().put("supabaseUrl", "http://127.0.0.1:54321").toString()).statusCode())
                .isEqualTo(200);
        assertThat(api.put(BASE + "/config", config().put("supabaseUrl", "http://localhost:54321").toString()).statusCode())
                .isEqualTo(200);
    }

    @Test
    void gt01_an_unreadable_or_invalid_file_starts_from_an_empty_connection() throws IOException {
        configure();
        api.close();
        registry.close();
        Files.writeString(dir.resolve("config/apps/gestask/config.json"), "{\"supabaseUrl\": \"ftp://x\"}");
        start();
        assertThat(TestApi.json(api.get(BASE + "/config")).get("missing")).hasSize(4);
    }

    @Test
    void gt03_without_a_complete_connection_every_call_is_a_409_and_nothing_leaves_the_machine() {
        ObjectNode partial = config();
        partial.remove("password");
        api.put(BASE + "/config", partial.toString());
        for (HttpResponse<String> r : List.of(api.get(BASE + "/fn/tasks-list"),
                api.post(BASE + "/fn/tasks-create", "{\"title\":\"x\"}"), api.post(BASE + "/connection/test", null))) {
            assertError(r, 409, "not_configured");
            assertThat(TestApi.json(r).get("details").get("missing")).extracting(JsonNode::asText).containsExactly("password");
            assertThat(TestApi.json(r).get("message").asText()).isEqualTo("Falta configurar: Contraseña");
        }
        assertThat(supabase.requests).isEmpty();
    }

    @Test
    void gt06_testing_the_connection_logs_in_again_and_never_returns_the_session() {
        configure();
        HttpResponse<String> first = api.post(BASE + "/connection/test", null);
        assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
        assertThat(TestApi.json(first).get("ok").asBoolean()).isTrue();
        assertThat(first.body()).doesNotContain("token-");
        assertThat(api.post(BASE + "/connection/test", null).statusCode()).isEqualTo(200);
        assertThat(supabase.logins).hasValue(2);

        supabase.loginReply = new Transport.Reply(400, "{\"error\":\"Invalid login credentials\"}");
        HttpResponse<String> wrong = api.post(BASE + "/connection/test", null);
        assertError(wrong, 409, "login_failed");
        assertThat(TestApi.json(wrong).get("message").asText())
                .isEqualTo("No se pudo iniciar sesión en Supabase: Invalid login credentials");
    }

    // --- Sesión y reenvío ---

    @Test
    void gt12_logs_in_like_the_web_on_the_first_call_and_keeps_the_session() {
        configure();
        assertThat(api.get(BASE + "/fn/tasks-list").statusCode()).isEqualTo(200);
        assertThat(api.get(BASE + "/fn/tasks-order-list").statusCode()).isEqualTo(200);

        assertThat(supabase.logins).hasValue(1);
        FakeSupabase.Request login = supabase.calls("auth-login").get(0);
        assertThat(login.method()).isEqualTo("POST");
        assertThat(login.uri()).hasToString(URL + "/functions/v1/auth-login");
        assertThat(jsonOf(login.body()).get("email").asText()).isEqualTo(EMAIL);
        assertThat(jsonOf(login.body()).get("password").asText()).isEqualTo(PASSWORD);
        assertThat(login.headers()).containsEntry("apikey", KEY).containsEntry("Content-Type", "application/json")
                .doesNotContainKey("Authorization");
    }

    /** El cuerpo de una petición saliente. */
    private static JsonNode jsonOf(String body) {
        try {
            return JSON.readTree(body);
        } catch (IOException e) {
            throw new AssertionError(e);
        }
    }


    @Test
    void gt11_gt13_forwards_each_function_with_its_real_method_query_body_and_headers_and_returns_the_answer_as_is() {
        configure();
        supabase.answer = r -> new Transport.Reply(200, "{\"tasks\":[{\"id\":\"a\",\"title\":\"Título ñ\"}]}");

        HttpResponse<String> list = api.get(BASE + "/fn/tasks-list?sort_by=scoring&sort_direction=desc&search=a%20b");
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(list.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        assertThat(list.body()).isEqualTo("{\"tasks\":[{\"id\":\"a\",\"title\":\"Título ñ\"}]}");
        FakeSupabase.Request sent = supabase.calls("tasks-list").get(0);
        assertThat(sent.method()).isEqualTo("GET");
        assertThat(sent.uri()).hasToString(URL + "/functions/v1/tasks-list?sort_by=scoring&sort_direction=desc&search=a%20b");
        assertThat(sent.body()).isNull();
        assertThat(sent.headers()).containsEntry("apikey", KEY).containsEntry("Authorization", "Bearer token-1")
                .containsEntry("Content-Type", "application/json");

        String[][] writes = {
                {"tasks-create", "POST"}, {"tasks-update", "PATCH"}, {"tasks-delete", "DELETE"},
                {"tasks-completion-resolve", "PATCH"}, {"tasks-order-update", "PATCH"},
                {"configuration-profile-update", "PATCH"}, {"configuration-create", "POST"},
                {"daily-tasks-complete", "PATCH"}, {"calendar-day-status-update", "PATCH"}};
        for (String[] w : writes) {
            String body = "{\"id\":\"" + w[0] + "\",\"title\":\"Año\"}";
            assertThat(api.post(BASE + "/fn/" + w[0], body).statusCode()).as(w[0]).isEqualTo(200);
            FakeSupabase.Request request = supabase.calls(w[0]).get(0);
            assertThat(request.method()).as(w[0]).isEqualTo(w[1]);
            assertThat(request.body()).as(w[0]).isEqualTo(body);
            assertThat(request.uri()).hasToString(URL + "/functions/v1/" + w[0]);
        }
        // Como la web: daily-report-create no lleva cuerpo.
        assertThat(api.post(BASE + "/fn/daily-report-create", null).statusCode()).isEqualTo(200);
        assertThat(supabase.calls("daily-report-create").get(0).body()).isNull();
        for (String read : List.of("tasks-completion-list", "tasks-order-list", "configuration-list", "daily-report-get",
                "daily-tasks-pending", "calendar-month-get")) {
            assertThat(api.get(BASE + "/fn/" + read).statusCode()).as(read).isEqualTo(200);
            assertThat(supabase.calls(read).get(0).method()).isEqualTo("GET");
        }
        // La respuesta no lleva nunca el token ni la contraseña.
        assertThat(list.body()).doesNotContain("token-").doesNotContain(PASSWORD);
    }

    @Test
    void gt11_gt17_a_function_outside_the_list_or_with_the_wrong_local_method_never_leaves_the_machine() {
        configure();
        assertError(api.get(BASE + "/fn/auth-register"), 404, "unknown_function");
        assertError(api.post(BASE + "/fn/auth-register", "{}"), 404, "unknown_function");
        assertError(api.post(BASE + "/fn/auth-login", "{}"), 404, "unknown_function");
        assertError(api.get(BASE + "/fn/otra-cosa"), 404, "unknown_function");
        assertError(api.get(BASE + "/fn/tasks-delete"), 405, "method_not_allowed");
        assertError(api.post(BASE + "/fn/tasks-list", "{}"), 405, "method_not_allowed");
        assertThat(supabase.requests).isEmpty();
    }

    @Test
    void gt17_the_only_host_contacted_is_the_configured_one_and_only_on_function_paths() {
        configure();
        api.get(BASE + "/fn/tasks-list");
        api.post(BASE + "/fn/tasks-update", "{\"id\":\"a\"}");
        api.post(BASE + "/connection/test", null);
        assertThat(supabase.requests).isNotEmpty().allSatisfy(r -> {
            assertThat(r.uri().getScheme()).isEqualTo("https");
            assertThat(r.uri().getHost()).isEqualTo("proyecto-de-prueba.supabase.example");
            assertThat(r.uri().getPath()).startsWith("/functions/v1/");
        });
    }

    @Test
    void gt14_an_expired_session_is_renewed_and_the_call_in_flight_returns_its_result() {
        configure();
        supabase.answer = r -> new Transport.Reply(200, "{\"task\":{\"id\":\"a\"}}");
        assertThat(api.get(BASE + "/fn/tasks-list").statusCode()).isEqualTo(200);

        supabase.expire();
        String body = "{\"id\":\"a\",\"task_status\":\"Done\"}";
        HttpResponse<String> r = api.post(BASE + "/fn/tasks-update", body);

        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        assertThat(r.body()).isEqualTo("{\"task\":{\"id\":\"a\"}}");
        assertThat(supabase.logins).hasValue(2);
        // La misma llamada, dos veces: con el token caducado y con el nuevo.
        List<FakeSupabase.Request> updates = supabase.calls("tasks-update");
        assertThat(updates).hasSize(2);
        assertThat(updates).allSatisfy(u -> {
            assertThat(u.method()).isEqualTo("PATCH");
            assertThat(u.body()).isEqualTo(body);
        });
        assertThat(updates.get(0).headers()).containsEntry("Authorization", "Bearer token-1");
        assertThat(updates.get(1).headers()).containsEntry("Authorization", "Bearer token-2");
        // Y la sesión nueva sirve para las siguientes.
        assertThat(api.get(BASE + "/fn/tasks-list").statusCode()).isEqualTo(200);
        assertThat(supabase.logins).hasValue(2);
    }

    @Test
    void gt12_gt14_calls_at_the_same_time_log_in_only_once() throws Exception {
        configure();
        int calls = 6;
        ExecutorService pool = Executors.newFixedThreadPool(calls);
        try {
            // Sin sesión: seis llamadas, un inicio de sesión.
            assertThat(parallel(pool, calls)).containsOnly(200);
            assertThat(supabase.logins).hasValue(1);

            // Las seis reciben su 401 con el mismo token: un solo inicio de sesión más.
            supabase.expire();
            supabase.rejected = new CyclicBarrier(calls);
            assertThat(parallel(pool, calls)).containsOnly(200);
            assertThat(supabase.logins).hasValue(2);
            assertThat(supabase.calls("tasks-list")).hasSize(calls * 3);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void gt14_calls_at_the_same_time_do_not_repeat_a_failed_login() throws Exception {
        configure();
        supabase.loginReply = new Transport.Reply(400, "{\"error\":\"Invalid login credentials\"}");
        // El primer inicio de sesión espera a que las seis llamadas estén en cola.
        int calls = 6;
        ExecutorService pool = Executors.newFixedThreadPool(calls);
        try {
            supabase.loginDelayMillis = 400;
            assertThat(parallel(pool, calls)).containsOnly(409);
            assertThat(supabase.calls("auth-login")).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
        // Una llamada posterior sí lo vuelve a intentar.
        supabase.loginDelayMillis = 0;
        assertError(api.get(BASE + "/fn/tasks-list"), 409, "login_failed");
        assertThat(supabase.calls("auth-login")).hasSize(2);
    }

    private List<Integer> parallel(ExecutorService pool, int calls) throws Exception {
        List<Callable<Integer>> jobs = new ArrayList<>();
        for (int i = 0; i < calls; i++) {
            jobs.add(() -> api.get(BASE + "/fn/tasks-list").statusCode());
        }
        List<Integer> out = new ArrayList<>();
        for (Future<Integer> f : pool.invokeAll(jobs, 30, TimeUnit.SECONDS)) {
            out.add(f.get());
        }
        return out;
    }

    @Test
    void gt14_if_the_new_login_fails_or_the_session_is_rejected_again_the_error_says_so() {
        configure();
        assertThat(api.get(BASE + "/fn/tasks-list").statusCode()).isEqualTo(200);

        supabase.rejectAll = true;
        assertError(api.get(BASE + "/fn/tasks-list"), 502, "session_rejected");
        // Una repetición, no un bucle.
        assertThat(supabase.calls("tasks-list")).hasSize(3);

        supabase.rejectAll = false;
        supabase.expire();
        supabase.loginReply = new Transport.Reply(400, "{\"error\":\"Invalid login credentials\"}");
        HttpResponse<String> r = api.get(BASE + "/fn/tasks-list");
        assertError(r, 409, "login_failed");
        assertThat(TestApi.json(r).get("message").asText()).contains("Invalid login credentials").doesNotContain(PASSWORD);

        supabase.loginReply = new Transport.Reply(200, "{\"session\":null}");
        assertError(api.get(BASE + "/fn/tasks-list"), 409, "login_failed");

        // Al arreglarse, la siguiente llamada vuelve a entrar sola.
        supabase.loginReply = null;
        assertThat(api.get(BASE + "/fn/tasks-list").statusCode()).isEqualTo(200);
    }

    @Test
    void gt15_an_error_of_the_function_keeps_its_status_and_its_message() {
        configure();
        supabase.answer = r -> new Transport.Reply(400, "{\"error\":\"Invalid ticket type.\"}");
        HttpResponse<String> bad = api.post(BASE + "/fn/tasks-create", "{}");
        assertError(bad, 400, "function_error");
        assertThat(TestApi.json(bad).get("message").asText()).isEqualTo("Invalid ticket type.");

        supabase.answer = r -> new Transport.Reply(404, "{\"error\":\"Task not found.\"}");
        assertError(api.post(BASE + "/fn/tasks-delete", "{\"id\":\"x\"}"), 404, "function_error");

        supabase.answer = r -> new Transport.Reply(404, "{\"code\":\"NOT_FOUND\"}");
        assertThat(TestApi.json(api.get(BASE + "/fn/tasks-list")).get("message").asText()).isEqualTo("Error HTTP 404");

        for (Transport.Reply reply : List.of(new Transport.Reply(500, "{\"error\":\"boom\"}"),
                new Transport.Reply(403, "{\"error\":\"no\"}"), new Transport.Reply(400, "<html>proxy</html>"),
                new Transport.Reply(302, ""))) {
            supabase.answer = r -> reply;
            assertError(api.get(BASE + "/fn/tasks-list"), 502, "supabase_error");
        }
    }

    @Test
    void gt16_without_contact_the_answer_is_a_502_that_says_so() {
        configure();
        supabase.offline = true;
        HttpResponse<String> r = api.get(BASE + "/fn/tasks-list");
        assertError(r, 502, "supabase_unreachable");
        assertThat(TestApi.json(r).get("message").asText()).isEqualTo("No hay contacto con Supabase");
        assertError(api.post(BASE + "/connection/test", null), 502, "supabase_unreachable");
    }

    @Test
    void gt05_saving_the_connection_discards_the_session() {
        configure();
        api.get(BASE + "/fn/tasks-list");
        assertThat(supabase.logins).hasValue(1);

        api.put(BASE + "/config", config().put("email", "otra@example.test").toString());
        api.get(BASE + "/fn/tasks-list");

        assertThat(supabase.logins).hasValue(2);
        assertThat(jsonOf(supabase.calls("auth-login").get(1).body()).get("email").asText()).isEqualTo("otra@example.test");
    }
}
