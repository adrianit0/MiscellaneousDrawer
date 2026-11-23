package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * JR-05 a JR-11, JR-19, JR-21, JR-24: la API REST 3 de Jira Cloud. Solo estas llamadas, todas de lectura: el usuario,
 * los proyectos, los estados de un proyecto, las prioridades y la búsqueda de tickets.
 */
final class Jira {

    /** JR-10 */
    static final int PROJECT_PAGE = 50;
    static final int MAX_PROJECTS = 200;
    /** JR-21, JR-23 */
    static final int ISSUE_PAGE = 100;
    static final List<String> FIELDS = List.of("summary", "status", "assignee", "project", "priority", "updated");
    /** JR-19 */
    static final int PRIORITY_PAGE = 50;
    static final int MAX_PRIORITIES = 200;

    private static final ObjectMapper JSON = new ObjectMapper();

    record Project(String key, String name) {
    }

    /** JR-11: category es new, indeterminate o done. */
    record Status(String id, String name, String category) {
    }

    /** JR-19 */
    record Priority(String id, String name) {
    }

    /** JR-20: priorityId y priorityName son null si el ticket no tiene prioridad. */
    record Issue(String key, String summary, String project, String statusId, String status, String assignee,
                 String priorityId, String priorityName, String updated) {
    }

    /** JR-23: truncated si Jira tiene más de los devueltos. */
    record Search(List<Issue> issues, boolean truncated) {
    }

    private final Transport transport;

    Jira(Transport transport) {
        this.transport = transport;
    }

    /** JR-06: el nombre visible de la cuenta del token. */
    String myself(JiraConfig config) throws InterruptedException {
        JsonNode me = ok(call(config, "GET", uri(config, "/myself"), null));
        return me.path("displayName").asText(config.email());
    }

    /** JR-10: los proyectos que contienen query en la clave o el nombre, por clave, hasta 200. */
    List<Project> projects(JiraConfig config, String query) throws InterruptedException {
        List<Project> out = new ArrayList<>();
        int start = 0;
        while (out.size() < MAX_PROJECTS) {
            String q = "query=" + enc(query == null ? "" : query) + "&orderBy=key&maxResults=" + PROJECT_PAGE
                    + "&startAt=" + start;
            JsonNode page = ok(call(config, "GET", uri(config, "/project/search?" + q), null));
            JsonNode values = page.path("values");
            for (JsonNode p : values) {
                if (out.size() < MAX_PROJECTS && p.hasNonNull("key")) {
                    out.add(new Project(p.path("key").asText(), p.path("name").asText(p.path("key").asText())));
                }
            }
            if (values.isEmpty() || page.path("isLast").asBoolean(true)) {
                break;
            }
            start += values.size();
        }
        return out;
    }

    /** JR-19: las prioridades del sitio, en el orden de Jira, hasta 200. */
    List<Priority> priorities(JiraConfig config) throws InterruptedException {
        List<Priority> out = new ArrayList<>();
        int start = 0;
        while (out.size() < MAX_PRIORITIES) {
            String q = "maxResults=" + PRIORITY_PAGE + "&startAt=" + start;
            JsonNode page = ok(call(config, "GET", uri(config, "/priority/search?" + q), null));
            JsonNode values = page.path("values");
            for (JsonNode p : values) {
                String id = p.path("id").asText("");
                if (out.size() < MAX_PRIORITIES && Board.PRIORITY_ID.matcher(id).matches()) {
                    out.add(new Priority(id, p.path("name").asText(id)));
                }
            }
            if (values.isEmpty() || page.path("isLast").asBoolean(true)) {
                break;
            }
            start += values.size();
        }
        return out;
    }

    /** JR-11: los estados del proyecto, sin repetir los que comparten sus tipos de incidencia. */
    List<Status> statuses(JiraConfig config, String projectKey) throws InterruptedException {
        return parseStatuses(ok(call(config, "GET", uri(config, "/project/" + enc(projectKey) + "/statuses"), null)));
    }

    /** JR-20: como {@link #statuses}, pero vacío si el proyecto ya no existe o no se puede ver (404). */
    Optional<List<Status>> statusesIfExists(JiraConfig config, String projectKey) throws InterruptedException {
        Transport.Reply reply = call(config, "GET", uri(config, "/project/" + enc(projectKey) + "/statuses"), null);
        if (reply.status() == 404) {
            return Optional.empty();
        }
        return Optional.of(parseStatuses(ok(reply)));
    }

    private static List<Status> parseStatuses(JsonNode types) {
        List<Status> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode type : types) {
            for (JsonNode s : type.path("statuses")) {
                String id = s.path("id").asText(null);
                if (id != null && seen.add(id)) {
                    out.add(new Status(id, s.path("name").asText(id),
                            s.path("statusCategory").path("key").asText("indeterminate")));
                }
            }
        }
        return out;
    }

    /** JR-21, JR-23: los tickets del JQL siguiendo nextPageToken, hasta max. */
    Search search(JiraConfig config, String jql, int max) throws InterruptedException {
        List<Issue> out = new ArrayList<>();
        String token = null;
        while (true) {
            ObjectNode body = JSON.createObjectNode();
            body.put("jql", jql);
            body.putPOJO("fields", FIELDS);
            body.put("maxResults", ISSUE_PAGE);
            if (token != null) {
                body.put("nextPageToken", token);
            }
            JsonNode page = ok(call(config, "POST", uri(config, "/search/jql"), body.toString()));
            JsonNode issues = page.path("issues");
            for (JsonNode i : issues) {
                if (out.size() == max) {
                    return new Search(out, true);
                }
                out.add(parse(i));
            }
            token = page.path("nextPageToken").asText(null);
            boolean last = page.path("isLast").asBoolean(token == null) || token == null || issues.isEmpty();
            if (last) {
                return new Search(out, false);
            }
            if (out.size() == max) {
                return new Search(out, true);
            }
        }
    }

    private static Issue parse(JsonNode issue) {
        JsonNode f = issue.path("fields");
        JsonNode assignee = f.get("assignee");
        JsonNode priority = f.get("priority");
        boolean hasPriority = priority != null && priority.hasNonNull("id");
        return new Issue(issue.path("key").asText(), f.path("summary").asText(""), f.path("project").path("key").asText(""),
                f.path("status").path("id").asText(""), f.path("status").path("name").asText(""),
                assignee == null || assignee.isNull() ? null : assignee.path("displayName").asText(null),
                hasPriority ? priority.path("id").asText() : null,
                hasPriority ? priority.path("name").asText(priority.path("id").asText()) : null,
                f.path("updated").asText(null));
    }

    // --- Llamadas ---

    private static URI uri(JiraConfig config, String tail) {
        return URI.create(config.siteUrl() + "/rest/api/3" + tail);
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** JR-05, JR-07: sin respuesta, 502 «No hay contacto con Jira». */
    private Transport.Reply call(JiraConfig config, String method, URI uri, String body) throws InterruptedException {
        Map<String, String> headers = body == null
                ? Map.of("Authorization", config.authorization(), "Accept", "application/json")
                : Map.of("Authorization", config.authorization(), "Accept", "application/json",
                "Content-Type", "application/json");
        try {
            return transport.send(method, uri, headers, body);
        } catch (IOException e) {
            throw new ApiError(502, "jira_unreachable", "No hay contacto con Jira");
        }
    }

    /** JR-07: el cuerpo de una respuesta 2xx, o el error para el usuario. */
    private static JsonNode ok(Transport.Reply reply) {
        if (reply.status() >= 200 && reply.status() < 300) {
            try {
                return JSON.readTree(reply.body() == null || reply.body().isBlank() ? "{}" : reply.body());
            } catch (IOException e) {
                throw new ApiError(502, "jira_error", "Jira respondió algo que no es JSON");
            }
        }
        throw new ApiError(502, "jira_error", message(reply));
    }

    /** JR-07 */
    static String message(Transport.Reply reply) {
        return switch (reply.status()) {
            case 401 -> "El email o el token no son válidos";
            case 403 -> "Tu cuenta no tiene permiso para ver esto";
            case 404 -> "No existe en Jira";
            case 429 -> "Jira limita las peticiones: prueba de nuevo en un minuto";
            default -> {
                String first = null;
                try {
                    first = JSON.readTree(reply.body() == null ? "{}" : reply.body()).path("errorMessages").path(0).asText(null);
                } catch (IOException e) {
                    // Sin cuerpo JSON: se dice el estado.
                }
                yield first == null || first.isBlank() ? "Jira respondió con el error HTTP " + reply.status() : first;
            }
        };
    }
}
