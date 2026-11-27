package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * JR-05 a JR-11, JR-19, JR-21, JR-24, JR-28, JR-29, JR-60, JR-62: la API REST 3 de Jira Cloud. Solo estas llamadas,
 * todas de lectura: el usuario, los campos, los proyectos, los estados de un proyecto, las prioridades, la búsqueda de
 * tickets, el icono de un tipo y el detalle de un ticket con sus comentarios.
 */
final class Jira {

    /** JR-10 */
    static final int PROJECT_PAGE = 50;
    static final int MAX_PROJECTS = 200;
    /** JR-21, JR-23 */
    static final int ISSUE_PAGE = 100;
    static final List<String> FIELDS = List.of("summary", "status", "assignee", "project", "priority", "created", "updated",
            "issuetype");
    /** JR-19 */
    static final int PRIORITY_PAGE = 50;
    static final int MAX_PRIORITIES = 200;
    /** JR-60: los campos del detalle de un ticket. */
    static final String DETAIL_FIELDS = "summary,status,issuetype,priority,assignee,reporter,created,updated,description,"
            + "parent,subtasks,issuelinks,attachment,labels,components";
    /** JR-62 */
    static final int COMMENT_PAGE = 100;
    static final int MAX_COMMENTS = 200;

    private static final ObjectMapper JSON = new ObjectMapper();

    record Project(String key, String name) {
    }

    /** JR-11: category es new, indeterminate o done. */
    record Status(String id, String name, String category) {
    }

    /** JR-19 */
    record Priority(String id, String name) {
    }

    /** JR-08 */
    record Field(String id, String name) {
    }

    /** JR-20: el tipo de un ticket; hierarchyLevel es 0 si Jira no lo da. */
    record IssueType(String id, String name, int hierarchyLevel) {
    }

    /**
     * JR-20: customer es el texto del campo del cliente (JR-28) o null; priorityId y priorityName son null si el ticket
     * no tiene prioridad; created y updated, como los da Jira; type es null si no tiene un tipo válido.
     */
    record Issue(String key, String summary, String project, String statusId, String status, String assignee,
                 String customer, String priorityId, String priorityName, String created, String updated,
                 IssueType type) {
    }

    /** JR-23: truncated si Jira tiene más de los devueltos. */
    record Search(List<Issue> issues, boolean truncated) {
    }

    /** JR-62: los comentarios tal como los da Jira, del más reciente al más antiguo; truncated si hay más. */
    record Comments(List<JsonNode> comments, boolean truncated) {
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

    /** JR-08: los campos personalizados con un identificador válido, por nombre y después por identificador. */
    List<Field> fields(JiraConfig config) throws InterruptedException {
        Collator byName = Collator.getInstance(Locale.forLanguageTag("es"));
        byName.setStrength(Collator.PRIMARY);
        List<Field> out = new ArrayList<>();
        for (JsonNode f : ok(call(config, "GET", uri(config, "/field"), null))) {
            String id = f.path("id").asText("");
            if (f.path("custom").asBoolean(false) && JiraConfig.CUSTOM_FIELD.matcher(id).matches()) {
                out.add(new Field(id, f.path("name").asText(id)));
            }
        }
        out.sort(Comparator.comparing(Field::name, byName).thenComparing(Field::id));
        return out;
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

    /** JR-21, JR-23: los tickets del JQL siguiendo nextPageToken, hasta max, con el campo del cliente si lo hay. */
    Search search(JiraConfig config, String jql, int max) throws InterruptedException {
        String customerField = config.customerField();
        List<String> fields = new ArrayList<>(FIELDS);
        if (customerField != null) {
            fields.add(customerField);
        }
        List<Issue> out = new ArrayList<>();
        String token = null;
        while (true) {
            ObjectNode body = JSON.createObjectNode();
            body.put("jql", jql);
            body.putPOJO("fields", fields);
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
                out.add(parse(i, customerField));
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

    /** JR-60: el ticket con los campos del detalle, tal como lo da Jira. La clave ya cumple JR-63. */
    JsonNode issue(JiraConfig config, String key) throws InterruptedException {
        return ok(call(config, "GET", uri(config, "/issue/" + enc(key) + "?fields=" + DETAIL_FIELDS), null));
    }

    /** JR-29: la URL del icono del tipo, tal como la da Jira, o null. El identificador ya es válido. */
    String issueTypeIconUrl(JiraConfig config, String id) throws InterruptedException {
        return ok(call(config, "GET", uri(config, "/issuetype/" + enc(id)), null)).path("iconUrl").asText(null);
    }

    /** JR-05, JR-29: un GET binario a una URL del sitio, o null si no hay contacto. */
    Transport.Binary download(JiraConfig config, URI uri, int max) throws InterruptedException {
        try {
            return transport.fetch(uri, Map.of("Authorization", config.authorization(), "Accept", "image/*"), max);
        } catch (IOException e) {
            return null;
        }
    }

    /** JR-62: los comentarios más recientes, hasta 200. */
    Comments comments(JiraConfig config, String key) throws InterruptedException {
        List<JsonNode> out = new ArrayList<>();
        int start = 0;
        while (true) {
            String q = "orderBy=-created&maxResults=" + COMMENT_PAGE + "&startAt=" + start;
            JsonNode page = ok(call(config, "GET", uri(config, "/issue/" + enc(key) + "/comment?" + q), null));
            JsonNode values = page.path("comments");
            for (JsonNode c : values) {
                if (out.size() == MAX_COMMENTS) {
                    return new Comments(out, true);
                }
                out.add(c);
            }
            start += values.size();
            int total = page.path("total").asInt(start);
            if (values.isEmpty() || start >= total) {
                return new Comments(out, false);
            }
            if (out.size() == MAX_COMMENTS) {
                return new Comments(out, true);
            }
        }
    }

    private static Issue parse(JsonNode issue, String customerField) {
        JsonNode f = issue.path("fields");
        JsonNode assignee = f.get("assignee");
        JsonNode priority = f.get("priority");
        boolean hasPriority = priority != null && priority.hasNonNull("id");
        JsonNode type = f.path("issuetype");
        String typeId = type.path("id").asText("");
        IssueType issueType = Board.STATUS_ID.matcher(typeId).matches()
                ? new IssueType(typeId, type.path("name").asText(typeId), type.path("hierarchyLevel").asInt(0))
                : null;
        return new Issue(issue.path("key").asText(), f.path("summary").asText(""), f.path("project").path("key").asText(""),
                f.path("status").path("id").asText(""), f.path("status").path("name").asText(""),
                assignee == null || assignee.isNull() ? null : assignee.path("displayName").asText(null),
                customerField == null ? null : customer(f.get(customerField)),
                hasPriority ? priority.path("id").asText() : null,
                hasPriority ? priority.path("name").asText(priority.path("id").asText()) : null,
                f.path("created").asText(null), f.path("updated").asText(null), issueType);
    }

    /** JR-28: el texto del valor del campo del cliente, según su tipo en Jira, o null. */
    static String customer(JsonNode value) {
        if (value != null && value.isArray()) {
            List<String> parts = new ArrayList<>();
            for (JsonNode element : value) {
                String text = single(element);
                if (text != null) {
                    parts.add(text);
                }
            }
            return parts.isEmpty() ? null : String.join(", ", parts);
        }
        return single(value);
    }

    /** JR-28: un texto o un número tal cual; de un objeto, displayName, value o name, el primero que sea un texto. */
    private static String single(JsonNode value) {
        String text = null;
        if (value == null) {
            return null;
        } else if (value.isTextual() || value.isNumber()) {
            text = value.asText();
        } else if (value.isObject()) {
            for (String key : List.of("displayName", "value", "name")) {
                JsonNode n = value.get(key);
                if (n != null && n.isTextual()) {
                    text = n.asText();
                    break;
                }
            }
        }
        if (text == null || text.isBlank()) {
            return null;
        }
        return text.strip();
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
