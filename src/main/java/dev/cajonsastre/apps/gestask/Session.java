package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * GT-12 a GT-16: la sesión de Supabase y el reenvío de las funciones. El token vive solo aquí, en memoria: no se
 * guarda, no se registra y no sale hacia la interfaz. Ante un 401 se inicia sesión de nuevo y la llamada se repite
 * una vez, de modo que quien llama no se entera (GT-14).
 */
final class Session {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String FUNCTIONS = "/functions/v1/";
    private static final String LOGIN = "auth-login";

    private final ConfigStore configs;
    private final Transport transport;
    /** El token en uso; null si no hay sesión. Protegido por this. */
    private String token;
    /** Inicios de sesión terminados, y el error del último si falló. Evitan repetir un inicio de sesión fallido (GT-14). */
    private final AtomicLong attempts = new AtomicLong();
    private ApiError lastFailure;

    Session(ConfigStore configs, Transport transport) {
        this.configs = configs;
        this.transport = transport;
    }

    /** GT-05: la siguiente llamada inicia sesión de nuevo. */
    synchronized void reset() {
        token = null;
    }

    /** GT-06: inicia sesión con la conexión guardada, descartando la que hubiera. */
    synchronized void test() {
        GestaskConfig config = configs.get();
        config.requireComplete();
        token = null;
        token = attempt(config);
    }

    /**
     * GT-13, GT-14: reenvía una función y devuelve el cuerpo de su respuesta. query y body pasan tal cual; null si no
     * hay.
     */
    String call(String function, String method, String query, String body) {
        GestaskConfig config = configs.get();
        config.requireComplete();
        URI uri = uri(config, function, query);
        long seen = attempts.get();
        String current = token(config, null, seen);
        Transport.Reply reply = send(method, uri, headers(config, current), body);
        if (reply.status() == 401) {
            current = token(config, current, seen);
            reply = send(method, uri, headers(config, current), body);
            if (reply.status() == 401) {
                throw new ApiError(502, "session_rejected", "Supabase rechaza la sesión recién iniciada");
            }
        }
        return result(reply);
    }

    /**
     * GT-12, GT-14: el token en uso. rejected es el que Supabase acaba de rechazar: si sigue siendo el actual, se
     * inicia sesión; si otra llamada ya lo renovó, vale el nuevo. Así varias llamadas rechazadas a la vez inician
     * sesión una sola vez. seen es el número de intentos terminados al empezar la llamada: si mientras esperaba otra
     * llamada lo intentó y falló, se devuelve ese mismo fallo en lugar de insistir con las mismas credenciales.
     */
    private synchronized String token(GestaskConfig config, String rejected, long seen) {
        if (token != null && !token.equals(rejected)) {
            return token;
        }
        if (lastFailure != null && attempts.get() != seen) {
            throw lastFailure;
        }
        token = null;
        token = attempt(config);
        return token;
    }

    /** Un inicio de sesión, que deja anotado si falló. Con this tomado. */
    private String attempt(GestaskConfig config) {
        try {
            String fresh = login(config);
            lastFailure = null;
            return fresh;
        } catch (ApiError e) {
            lastFailure = e;
            throw e;
        } finally {
            // Al terminar: quien empezó antes de este punto ya tiene su respuesta en este intento.
            attempts.incrementAndGet();
        }
    }

    /** GT-12: como la web: POST auth-login con el email y la contraseña, y solo la cabecera apikey. */
    private String login(GestaskConfig config) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("apikey", config.publishableKey());
        String body = JSON.createObjectNode().put("email", config.email()).put("password", config.password()).toString();
        Transport.Reply reply = send("POST", uri(config, LOGIN, null), headers, body);
        JsonNode payload = parse(reply.body());
        if (reply.status() < 200 || reply.status() >= 300) {
            throw loginFailed(error(payload, reply.status()));
        }
        JsonNode access = payload == null ? null : payload.path("session").path("access_token");
        if (access == null || !access.isTextual() || access.asText().isBlank()) {
            throw loginFailed("la respuesta no trae una sesión");
        }
        return access.asText();
    }

    private static ApiError loginFailed(String reason) {
        return new ApiError(409, "login_failed", "No se pudo iniciar sesión en Supabase: " + reason);
    }

    private static URI uri(GestaskConfig config, String function, String query) {
        try {
            return URI.create(config.supabaseUrl() + FUNCTIONS + function + (query == null ? "" : "?" + query));
        } catch (IllegalArgumentException e) {
            throw ApiError.badRequest("invalid_query", "La consulta no es válida");
        }
    }

    private static Map<String, String> headers(GestaskConfig config, String token) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("apikey", config.publishableKey());
        headers.put("Authorization", "Bearer " + token);
        return headers;
    }

    /** GT-16 */
    private Transport.Reply send(String method, URI uri, Map<String, String> headers, String body) {
        try {
            return transport.send(method, uri, headers, body);
        } catch (IOException e) {
            throw unreachable();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unreachable();
        }
    }

    private static ApiError unreachable() {
        return new ApiError(502, "supabase_unreachable", "No hay contacto con Supabase");
    }

    /** GT-13, GT-15 */
    private static String result(Transport.Reply reply) {
        int status = reply.status();
        if (status >= 200 && status < 300) {
            return reply.body() == null || reply.body().isBlank() ? "{}" : reply.body();
        }
        JsonNode payload = parse(reply.body());
        if (payload != null && status >= 400 && status < 500 && status != 403) {
            throw new ApiError(status, "function_error", error(payload, status));
        }
        throw new ApiError(502, "supabase_error", "Supabase respondió con un error: " + error(payload, status));
    }

    /** El mensaje de {"error": "…"}, o el estado si no lo trae. */
    private static String error(JsonNode payload, int status) {
        JsonNode error = payload == null ? null : payload.get("error");
        return error != null && error.isTextual() && !error.asText().isBlank() ? error.asText() : "Error HTTP " + status;
    }

    /** null si no es un objeto JSON. */
    private static JsonNode parse(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode node = JSON.readTree(body);
            return node != null && node.isObject() ? node : null;
        } catch (IOException e) {
            return null;
        }
    }
}
