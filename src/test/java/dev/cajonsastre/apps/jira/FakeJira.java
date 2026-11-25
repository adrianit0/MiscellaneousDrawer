package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Jira Cloud simulado, para probar la mini app sin contactar con ningún servidor (ADR-0027). Entiende las cuatro
 * llamadas de {@link Jira} y evalúa el JQL que arma {@link IssueQuery}. Todos los datos son inventados (S-31).
 */
final class FakeJira implements Transport {

    static final String SITE = "https://empresa-inventada.atlassian.net";
    static final String EMAIL = "persona@example.test";
    static final String TOKEN = "token-inventado-0123456789";
    static final Instant NOW = Instant.parse("2026-11-23T10:00:00Z");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern CLAUSE = Pattern.compile("\\(project = \"([A-Z0-9_]+)\" AND \\((.*?)\\)\\)(?= OR \\(project| ORDER BY)");
    private static final Pattern CLOSED = Pattern.compile("\\(status in \\(([^)]*)\\) AND updated >= -(\\d+)d\\)");
    private static final Pattern OPEN = Pattern.compile("status in \\(([^)]*)\\)");

    record Request(String method, URI uri, Map<String, String> headers, String body) {
        Map<String, String> query() {
            Map<String, String> out = new HashMap<>();
            String raw = uri.getRawQuery();
            if (raw != null) {
                for (String pair : raw.split("&")) {
                    int eq = pair.indexOf('=');
                    out.put(pair.substring(0, eq), URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
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

    record Status(String id, String name, String category) {
    }

    record Issue(String key, String project, String statusId, String summary, String assignee, Instant updated) {
    }

    final List<Request> requests = new CopyOnWriteArrayList<>();
    final Map<String, String> projects = new LinkedHashMap<>();
    /** Los estados de cada proyecto, por tipo de incidencia. */
    final Map<String, List<List<Status>>> statuses = new LinkedHashMap<>();
    /** Del actualizado más recientemente al más antiguo. */
    final List<Issue> issues = new CopyOnWriteArrayList<>();
    /** JR-19: las prioridades del sitio, por identificador, en orden. */
    final Map<String, String> priorities = new LinkedHashMap<>();
    /** JR-20: la prioridad de cada ticket, por su clave; el que no está no tiene prioridad. */
    final Map<String, String> issuePriority = new HashMap<>();
    /** JR-60: el ticket que devuelve GET /issue/{clave}, por su clave, con su key y sus fields. */
    final Map<String, ObjectNode> details = new HashMap<>();
    /** JR-62: los comentarios de cada ticket, del más antiguo al más reciente. */
    final Map<String, List<ObjectNode>> comments = new HashMap<>();
    volatile boolean offline;
    /** Si no es null, la respuesta a todas las llamadas. */
    volatile Reply forced;

    void project(String key, String name, Status... list) {
        projects.put(key, name);
        // Dos tipos de incidencia con los mismos estados: JR-11 no los repite.
        statuses.put(key, List.of(List.of(list), List.of(list)));
    }

    void issue(String key, String project, String statusId, String summary, String assignee, Duration age) {
        issues.add(new Issue(key, project, statusId, summary, assignee, NOW.minus(age)));
    }

    List<Request> searches() {
        return requests.stream().filter(r -> r.uri().getPath().endsWith("/search/jql")).toList();
    }

    @Override
    public Reply send(String method, URI uri, Map<String, String> headers, String body) throws IOException {
        Request request = new Request(method, uri, headers, body);
        requests.add(request);
        if (offline) {
            throw new IOException("sin contacto");
        }
        if (forced != null) {
            return forced;
        }
        String expected = "Basic " + java.util.Base64.getEncoder()
                .encodeToString((EMAIL + ":" + TOKEN).getBytes(StandardCharsets.UTF_8));
        if (!expected.equals(headers.get("Authorization"))) {
            return new Reply(401, "");
        }
        String path = uri.getPath();
        if (!path.startsWith("/rest/api/3/")) {
            return new Reply(404, "{}");
        }
        String tail = path.substring("/rest/api/3".length());
        if (method.equals("GET") && tail.equals("/myself")) {
            return ok(JSON.createObjectNode().put("displayName", "Persona Inventada"));
        }
        if (method.equals("GET") && tail.equals("/project/search")) {
            return projectSearch(request.query());
        }
        Matcher m = Pattern.compile("/project/([^/]+)/statuses").matcher(tail);
        if (method.equals("GET") && m.matches()) {
            List<List<Status>> types = statuses.get(m.group(1));
            if (types == null) {
                return new Reply(404, "{\"errorMessages\":[\"No project could be found\"]}");
            }
            ArrayNode out = JSON.createArrayNode();
            for (List<Status> type : types) {
                ObjectNode t = out.addObject().put("id", "1").put("name", "Tarea");
                ArrayNode list = t.putArray("statuses");
                type.forEach(s -> list.addObject().put("id", s.id()).put("name", s.name())
                        .putObject("statusCategory").put("key", s.category()));
            }
            return ok(out);
        }
        if (method.equals("GET") && tail.equals("/priority/search")) {
            return prioritySearch(request.query());
        }
        if (method.equals("POST") && tail.equals("/search/jql")) {
            return search(request.json());
        }
        Matcher detail = Pattern.compile("/issue/([^/]+)").matcher(tail);
        if (method.equals("GET") && detail.matches()) {
            ObjectNode issue = details.get(detail.group(1));
            return issue == null ? new Reply(404, "{\"errorMessages\":[\"Issue does not exist\"]}") : ok(issue);
        }
        Matcher comment = Pattern.compile("/issue/([^/]+)/comment").matcher(tail);
        if (method.equals("GET") && comment.matches()) {
            return commentPage(comment.group(1), request.query());
        }
        return new Reply(405, "{}");
    }

    private Reply projectSearch(Map<String, String> query) {
        String text = query.getOrDefault("query", "").toLowerCase();
        int start = Integer.parseInt(query.getOrDefault("startAt", "0"));
        int max = Integer.parseInt(query.getOrDefault("maxResults", "50"));
        List<Map.Entry<String, String>> matching = projects.entrySet().stream()
                .filter(e -> e.getKey().toLowerCase().contains(text) || e.getValue().toLowerCase().contains(text)).toList();
        ObjectNode page = JSON.createObjectNode();
        ArrayNode values = page.putArray("values");
        matching.stream().skip(start).limit(max).forEach(e -> values.addObject().put("key", e.getKey()).put("name", e.getValue()));
        page.put("isLast", start + max >= matching.size());
        return ok(page);
    }

    private Reply prioritySearch(Map<String, String> query) {
        int start = Integer.parseInt(query.getOrDefault("startAt", "0"));
        int max = Integer.parseInt(query.getOrDefault("maxResults", "50"));
        ObjectNode page = JSON.createObjectNode();
        ArrayNode values = page.putArray("values");
        priorities.entrySet().stream().skip(start).limit(max).forEach(e -> values.addObject().put("id", e.getKey())
                .put("name", e.getValue()).put("statusColor", "#ff0000").put("iconUrl", SITE + "/icon.svg"));
        page.put("isLast", start + max >= priorities.size());
        return ok(page);
    }

    /** JR-62: los comentarios por páginas, del más reciente al más antiguo con orderBy=-created. */
    private Reply commentPage(String key, Map<String, String> query) {
        if (!details.containsKey(key)) {
            return new Reply(404, "{\"errorMessages\":[\"Issue does not exist\"]}");
        }
        List<ObjectNode> all = new ArrayList<>(comments.getOrDefault(key, List.of()));
        if ("-created".equals(query.get("orderBy"))) {
            java.util.Collections.reverse(all);
        }
        int start = Integer.parseInt(query.getOrDefault("startAt", "0"));
        int max = Integer.parseInt(query.getOrDefault("maxResults", "50"));
        ObjectNode page = JSON.createObjectNode().put("startAt", start).put("maxResults", max).put("total", all.size());
        ArrayNode values = page.putArray("comments");
        all.stream().skip(start).limit(max).forEach(values::add);
        return ok(page);
    }

    /** Evalúa el JQL de JR-21: por proyecto, sus estados abiertos y sus cerrados recientes. */
    private Reply search(JsonNode body) {
        String jql = body.path("jql").asText();
        if (!jql.endsWith(" ORDER BY updated DESC")) {
            return new Reply(400, "{\"errorMessages\":[\"JQL no esperado\"]}");
        }
        Map<String, Set<String>> open = new HashMap<>();
        Map<String, Set<String>> closed = new HashMap<>();
        Map<String, Integer> days = new HashMap<>();
        Matcher clause = CLAUSE.matcher(jql);
        while (clause.find()) {
            String project = clause.group(1);
            String rest = clause.group(2);
            Matcher c = CLOSED.matcher(rest);
            if (c.find()) {
                closed.put(project, ids(c.group(1)));
                days.put(project, Integer.parseInt(c.group(2)));
                rest = rest.substring(0, c.start()) + rest.substring(c.end());
            }
            Matcher o = OPEN.matcher(rest);
            if (o.find()) {
                open.put(project, ids(o.group(1)));
            }
        }
        List<Issue> matching = issues.stream().filter(i -> open.getOrDefault(i.project(), Set.of()).contains(i.statusId())
                || (closed.getOrDefault(i.project(), Set.of()).contains(i.statusId())
                && !i.updated().isBefore(NOW.minus(Duration.ofDays(days.get(i.project())))))).toList();

        int start = body.hasNonNull("nextPageToken") ? Integer.parseInt(body.get("nextPageToken").asText()) : 0;
        int max = body.path("maxResults").asInt(50);
        ObjectNode page = JSON.createObjectNode();
        ArrayNode list = page.putArray("issues");
        for (Issue i : matching.stream().skip(start).limit(max).toList()) {
            ObjectNode n = list.addObject().put("id", "1").put("key", i.key());
            ObjectNode f = n.putObject("fields");
            f.put("summary", i.summary());
            f.putObject("project").put("key", i.project());
            String name = statusName(i.project(), i.statusId());
            f.putObject("status").put("id", i.statusId()).put("name", name);
            if (i.assignee() == null) {
                f.putNull("assignee");
            } else {
                f.putObject("assignee").put("displayName", i.assignee());
            }
            String priority = issuePriority.get(i.key());
            if (priority == null) {
                f.putNull("priority");
            } else {
                f.putObject("priority").put("id", priority).put("name", priorities.getOrDefault(priority, "?"));
            }
            // JR-20: creado diez días antes de su última actualización.
            f.put("created", i.updated().minus(Duration.ofDays(10)).toString());
            f.put("updated", i.updated().toString());
        }
        boolean last = start + max >= matching.size();
        page.put("isLast", last);
        if (!last) {
            page.put("nextPageToken", String.valueOf(start + max));
        }
        return ok(page);
    }

    private String statusName(String project, String id) {
        return statuses.getOrDefault(project, List.of()).stream().flatMap(List::stream).filter(s -> s.id().equals(id))
                .map(Status::name).findFirst().orElse("?");
    }

    private static Set<String> ids(String list) {
        return Arrays.stream(list.split(",")).map(String::strip).collect(Collectors.toSet());
    }

    private static Reply ok(JsonNode body) {
        return new Reply(200, body.toString());
    }

    /** Para las pruebas que necesitan la lista de tickets en orden. */
    static List<String> keys(JsonNode issues) {
        List<String> out = new ArrayList<>();
        issues.forEach(i -> out.add(i.get("key").asText()));
        return out;
    }
}
