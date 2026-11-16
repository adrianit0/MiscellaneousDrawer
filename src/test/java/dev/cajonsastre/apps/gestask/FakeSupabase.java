package dev.cajonsastre.apps.gestask;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * Supabase simulado, para probar la mini app sin contactar con ningún servidor (ADR-0020). Entiende {@code auth-login}
 * y responde a las demás funciones con {@link #answer}. Todos los datos son inventados (S-31).
 */
final class FakeSupabase implements Transport {

    record Request(String method, URI uri, Map<String, String> headers, String body) {
        /** «tasks-list» de …/functions/v1/tasks-list. */
        String function() {
            String path = uri.getPath();
            return path.substring(path.lastIndexOf('/') + 1);
        }
    }

    /** Todas las peticiones recibidas, en orden. */
    final List<Request> requests = new CopyOnWriteArrayList<>();
    /** Los tokens que siguen valiendo. */
    final Set<String> valid = ConcurrentHashMap.newKeySet();
    final AtomicInteger logins = new AtomicInteger();
    /** Lo que responde una función con un token válido. */
    volatile Function<Request, Reply> answer = r -> new Reply(200, "{\"ok\":true}");
    /** Si no es null, auth-login responde esto. */
    volatile Reply loginReply;
    /** Si es true, no hay contacto. */
    volatile boolean offline;
    /** Si es true, ningún token vale aunque se acabe de emitir. */
    volatile boolean rejectAll;
    /** Si no es null, las llamadas con un token caducado esperan aquí a estar todas antes de recibir su 401. */
    volatile CyclicBarrier rejected;
    /** Lo que tarda auth-login en responder. */
    volatile long loginDelayMillis;

    /** La sesión caduca en Supabase: los tokens emitidos dejan de valer. */
    void expire() {
        valid.clear();
    }

    List<Request> calls(String function) {
        return requests.stream().filter(r -> r.function().equals(function)).toList();
    }

    @Override
    public Reply send(String method, URI uri, Map<String, String> headers, String body)
            throws IOException, InterruptedException {
        if (offline) {
            throw new IOException("sin red");
        }
        Request request = new Request(method, uri, Map.copyOf(headers), body);
        requests.add(request);
        if (request.function().equals("auth-login")) {
            if (loginDelayMillis > 0) {
                Thread.sleep(loginDelayMillis);
            }
            Reply forced = loginReply;
            if (forced != null) {
                return forced;
            }
            String token = "token-" + logins.incrementAndGet();
            valid.add(token);
            return new Reply(200, "{\"session\":{\"access_token\":\"" + token + "\",\"refresh_token\":\"r\"},"
                    + "\"user\":{\"email\":\"persona@example.test\"}}");
        }
        String authorization = headers.getOrDefault("Authorization", "");
        String token = authorization.startsWith("Bearer ") ? authorization.substring(7) : "";
        if (rejectAll || !valid.contains(token)) {
            CyclicBarrier barrier = rejected;
            if (barrier != null) {
                try {
                    barrier.await(10, TimeUnit.SECONDS);
                } catch (BrokenBarrierException | TimeoutException e) {
                    throw new IOException(e);
                }
            }
            return new Reply(401, "{\"error\":\"Invalid or expired session.\"}");
        }
        return answer.apply(request);
    }
}
