package dev.cajonsastre.apps.resubmit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

/**
 * Bitbucket Data Center simulado, para probar la mini app sin contactar con ningún servidor (ADR-0023). Entiende las
 * tres llamadas de {@link Bitbucket}. Todos los datos son inventados (S-31).
 */
final class FakeBitbucket implements Transport {

    static final String BASE = "https://bitbucket.example.test";
    static final String PROJECT = "PROJ";
    static final String REPO = "demo";
    static final String USER = "persona";
    static final String TOKEN = "token-inventado-0123456789";
    private static final ObjectMapper JSON = new ObjectMapper();

    record Request(String method, URI uri, Map<String, String> headers, String body) {
        Map<String, String> query() {
            Map<String, String> out = new HashMap<>();
            String raw = uri.getRawQuery();
            if (raw != null) {
                for (String pair : raw.split("&")) {
                    int eq = pair.indexOf('=');
                    out.put(pair.substring(0, eq), java.net.URLDecoder.decode(pair.substring(eq + 1),
                            java.nio.charset.StandardCharsets.UTF_8));
                }
            }
            return out;
        }

        JsonNode json() {
            try {
                return JSON.readTree(body);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    final List<Request> requests = new CopyOnWriteArrayList<>();
    /** Lo que devuelve la lista de PR, del más reciente al más antiguo. */
    final List<ObjectNode> pullRequests = new CopyOnWriteArrayList<>();
    final AtomicLong nextId = new AtomicLong(500);
    /** Si es true, no hay contacto. */
    volatile boolean offline;
    /** Si no es null, la respuesta a todas las llamadas. */
    volatile Reply forced;
    /** Si no es null, la respuesta a crear un PR; si devuelve null, se crea. */
    volatile Function<Request, Reply> onCreate;
    /** Si no es null, crear un PR espera aquí hasta que se interrumpa. */
    volatile CountDownLatch createReached;
    /** Si no es null, la respuesta a actualizar un PR (RP-36); si devuelve null, se actualiza. */
    volatile Function<Request, Reply> onUpdate;

    List<Request> lists() {
        return requests.stream().filter(r -> r.method().equals("GET") && r.uri().getPath().endsWith("/pull-requests")).toList();
    }

    List<Request> creates() {
        return requests.stream().filter(r -> r.method().equals("POST")).toList();
    }

    /** RP-36 */
    List<Request> updates() {
        return requests.stream().filter(r -> r.method().equals("PUT")).toList();
    }

    /** El PR de la lista con ese número, como lo guarda Bitbucket. */
    ObjectNode stored(long id) {
        return pullRequests.stream().filter(p -> p.get("id").asLong() == id).findFirst().orElse(null);
    }

    /** Un PR como lo devuelve Bitbucket. */
    static ObjectNode pr(long id, String branch, String state, Instant created, Instant closed, String latestCommit) {
        ObjectNode pr = JSON.createObjectNode();
        pr.put("id", id);
        pr.put("version", 3);
        pr.put("title", "Corrige el caso " + id);
        pr.put("description", "Descripción inventada del PR " + id);
        pr.put("state", state);
        pr.put("createdDate", created.toEpochMilli());
        if (closed != null) {
            pr.put("closedDate", closed.toEpochMilli());
        }
        pr.set("fromRef", ref("refs/heads/" + branch, branch, latestCommit, REPO));
        pr.set("toRef", ref("refs/heads/hotfix", "hotfix", "0000000000000000000000000000000000000000", REPO));
        pr.putObject("author").putObject("user").put("name", USER).put("slug", USER);
        ArrayNode reviewers = pr.putArray("reviewers");
        reviewers.addObject().putObject("user").put("name", "revisora");
        pr.putObject("links").putArray("self").addObject().put("href",
                BASE + "/projects/" + PROJECT + "/repos/" + REPO + "/pull-requests/" + id);
        return pr;
    }

    static ObjectNode ref(String id, String displayId, String latestCommit, String slug) {
        ObjectNode ref = JSON.createObjectNode();
        ref.put("id", id);
        ref.put("displayId", displayId);
        if (latestCommit != null) {
            ref.put("latestCommit", latestCommit);
        }
        ObjectNode repository = ref.putObject("repository");
        repository.put("slug", slug);
        repository.putObject("project").put("key", PROJECT);
        return ref;
    }

    @Override
    public Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException, InterruptedException {
        if (offline) {
            throw new IOException("sin red");
        }
        Request request = new Request(method, uri, Map.copyOf(headers), body);
        requests.add(request);
        if (forced != null) {
            return forced;
        }
        if (!("Bearer " + TOKEN).equals(headers.get("Authorization"))) {
            return new Reply(401, "{\"errors\":[{\"message\":\"Authentication failed\"}]}");
        }
        String repoPath = "/rest/api/1.0/projects/" + PROJECT + "/repos/" + REPO;
        String path = uri.getPath();
        if (method.equals("GET") && path.equals(repoPath)) {
            return new Reply(200, "{\"slug\":\"" + REPO + "\",\"project\":{\"key\":\"" + PROJECT + "\"}}");
        }
        if (method.equals("GET") && path.equals(repoPath + "/pull-requests")) {
            Map<String, String> q = request.query();
            int start = Integer.parseInt(q.getOrDefault("start", "0"));
            int limit = Integer.parseInt(q.getOrDefault("limit", "25"));
            List<ObjectNode> all = new ArrayList<>(pullRequests);
            int end = Math.min(all.size(), start + limit);
            ObjectNode page = JSON.createObjectNode();
            ArrayNode values = page.putArray("values");
            all.subList(Math.min(start, all.size()), end).forEach(values::add);
            page.put("isLastPage", end >= all.size());
            if (end < all.size()) {
                page.put("nextPageStart", end);
            }
            return new Reply(200, page.toString());
        }
        if (path.startsWith(repoPath + "/pull-requests/") && (method.equals("GET") || method.equals("PUT"))) {
            ObjectNode pr = stored(Long.parseLong(path.substring(path.lastIndexOf('/') + 1)));
            if (pr == null) {
                return new Reply(404, "{\"errors\":[{\"message\":\"No existe el PR\"}]}");
            }
            if (method.equals("GET")) {
                return new Reply(200, pr.toString());
            }
            Function<Request, Reply> custom = onUpdate;
            Reply reply = custom == null ? null : custom.apply(request);
            if (reply != null) {
                return reply;
            }
            JsonNode update = request.json();
            // Como Bitbucket: la versión debe ser la actual, y lo que no se envía se pierde.
            if (update.get("version").asInt() != pr.get("version").asInt()) {
                return new Reply(409, "{\"errors\":[{\"message\":\"La versión del PR no es la actual\"}]}");
            }
            pr.put("version", pr.get("version").asInt() + 1);
            pr.put("title", update.path("title").asText());
            pr.put("description", update.path("description").asText());
            pr.set("reviewers", update.path("reviewers").deepCopy());
            return new Reply(200, pr.toString());
        }
        if (method.equals("POST") && path.equals(repoPath + "/pull-requests")) {
            CountDownLatch reached = createReached;
            if (reached != null) {
                reached.countDown();
                new CountDownLatch(1).await();
            }
            Function<Request, Reply> custom = onCreate;
            Reply reply = custom == null ? null : custom.apply(request);
            if (reply != null) {
                return reply;
            }
            long id = nextId.incrementAndGet();
            return new Reply(201, "{\"id\":" + id + ",\"links\":{\"self\":[{\"href\":\"" + BASE + "/projects/" + PROJECT
                    + "/repos/" + REPO + "/pull-requests/" + id + "\"}]}}");
        }
        return new Reply(404, "{\"errors\":[{\"message\":\"No existe\"}]}");
    }
}
