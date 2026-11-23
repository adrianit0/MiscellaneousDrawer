package dev.cajonsastre.apps.resubmit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * RP-05, RP-06, RP-10, RP-28, RP-36: la API REST 1.0 de Bitbucket Data Center. Solo estas llamadas: leer el
 * repositorio, listar los PR del usuario contra la rama destino, crear uno, y leer y actualizar uno rechazado.
 */
final class Bitbucket {

    /** RP-10 */
    static final int PAGE = 50;
    static final int MAX_PULL_REQUESTS = 200;
    /** RP-36 */
    static final String NEW_PR = "Nuevo PR: ";
    static final String DELETE_BRANCH = "**Pendiente de eliminar esta rama**";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** RP-28: el PR creado; warning dice si se creó sin revisores. */
    record Created(long id, String link, String warning) {
    }

    private final Transport transport;

    Bitbucket(Transport transport) {
        this.transport = transport;
    }

    /** RP-05: «<proyecto>/<repositorio>» tal como lo nombra Bitbucket. */
    String repository(ResubmitConfig config) throws InterruptedException {
        JsonNode repo = ok(call(config, "GET", repoUri(config, ""), null));
        String key = repo.path("project").path("key").asText(config.projectKey());
        return key + "/" + repo.path("slug").asText(config.repoSlug());
    }

    /** RP-10: los PR del usuario contra la rama destino, del más reciente al más antiguo, hasta 200. */
    List<PullRequest> pullRequests(ResubmitConfig config) throws InterruptedException {
        List<PullRequest> out = new ArrayList<>();
        int start = 0;
        while (out.size() < MAX_PULL_REQUESTS) {
            String query = "state=ALL&direction=INCOMING&at=" + enc("refs/heads/" + config.target()) + "&order=NEWEST"
                    + "&role.1=AUTHOR&username.1=" + enc(config.username()) + "&limit=" + PAGE + "&start=" + start;
            JsonNode page = ok(call(config, "GET", repoUri(config, "/pull-requests?" + query), null));
            JsonNode values = page.path("values");
            for (JsonNode pr : values) {
                PullRequest parsed = parse(pr);
                // RP-10: un PR de otro autor se descarta.
                if (mine(pr, config.username()) && out.size() < MAX_PULL_REQUESTS) {
                    out.add(parsed);
                }
            }
            if (values.isEmpty() || page.path("isLastPage").asBoolean(true) || !page.path("nextPageStart").canConvertToInt()) {
                break;
            }
            start = page.path("nextPageStart").asInt();
        }
        return out;
    }

    /**
     * RP-28: crea el PR de la rama nueva contra la rama destino con el título, la descripción y los revisores del
     * rechazado. Si Bitbucket rechaza los revisores (409), lo crea sin ellos.
     */
    Created create(ResubmitConfig config, PullRequest old, String branch) throws InterruptedException {
        String description = description(old);
        Transport.Reply reply = call(config, "POST", repoUri(config, "/pull-requests"),
                body(config, old.title(), description, branch, old.reviewers()));
        String warning = null;
        if (reply.status() == 409 && !old.reviewers().isEmpty()) {
            warning = "PR creado sin revisores: " + message(reply);
            reply = call(config, "POST", repoUri(config, "/pull-requests"), body(config, old.title(), description, branch, List.of()));
        }
        JsonNode created = ok(reply);
        return new Created(created.path("id").asLong(), link(created), warning);
    }

    /**
     * RP-36: añade a la descripción del PR rechazado el enlace al nuevo. Lo vuelve a pedir para tener su versión, y
     * envía su título y sus revisores porque una actualización sin revisores los quita.
     *
     * @return false si ya estaba anotado con ese enlace
     */
    boolean annotate(ResubmitConfig config, long id, String newLink) throws InterruptedException {
        URI uri = repoUri(config, "/pull-requests/" + id);
        JsonNode pr = ok(call(config, "GET", uri, null));
        String description = annotated(text(pr.get("description")), newLink);
        if (description == null) {
            return false;
        }
        ObjectNode body = JSON.createObjectNode();
        body.put("version", pr.path("version").asInt());
        body.put("title", pr.path("title").asText(""));
        body.put("description", description);
        ArrayNode reviewers = body.putArray("reviewers");
        pr.path("reviewers").forEach(r -> {
            String name = r.path("user").path("name").asText(null);
            if (name != null) {
                reviewers.addObject().putObject("user").put("name", name);
            }
        });
        ok(call(config, "PUT", uri, body.toString()));
        return true;
    }

    /** RP-36: la descripción con la nota al final, tras una línea en blanco; null si ya tiene la línea del enlace. */
    static String annotated(String description, String newLink) {
        String line = NEW_PR + newLink;
        if (description != null && description.lines().anyMatch(l -> l.strip().equals(line))) {
            return null;
        }
        String note = line + "\n" + DELETE_BRANCH;
        return description == null || description.isBlank() ? note : description.stripTrailing() + "\n\n" + note;
    }

    /** RP-28: la descripción del rechazado y, tras una línea en blanco, de dónde procede. */
    static String description(PullRequest old) {
        String origin = "Procede de: " + old.link();
        String text = old.description();
        return text == null || text.isBlank() ? origin : text.stripTrailing() + "\n\n" + origin;
    }

    private static String body(ResubmitConfig config, String title, String description, String branch, List<String> reviewers) {
        ObjectNode body = JSON.createObjectNode();
        body.put("title", title);
        body.put("description", description);
        body.set("fromRef", ref(config, "refs/heads/" + branch));
        body.set("toRef", ref(config, "refs/heads/" + config.target()));
        ArrayNode list = body.putArray("reviewers");
        reviewers.forEach(name -> list.addObject().putObject("user").put("name", name));
        return body.toString();
    }

    private static ObjectNode ref(ResubmitConfig config, String id) {
        ObjectNode ref = JSON.createObjectNode();
        ref.put("id", id);
        ObjectNode repository = ref.putObject("repository");
        repository.put("slug", config.repoSlug());
        repository.putObject("project").put("key", config.projectKey());
        return ref;
    }

    // --- Lectura de la respuesta ---

    private static boolean mine(JsonNode pr, String username) {
        JsonNode user = pr.path("author").path("user");
        return username.equalsIgnoreCase(user.path("name").asText("")) || username.equalsIgnoreCase(user.path("slug").asText(""));
    }

    static PullRequest parse(JsonNode pr) {
        JsonNode from = pr.path("fromRef");
        JsonNode to = pr.path("toRef");
        String branch = from.path("displayId").asText(null);
        if (branch == null) {
            String id = from.path("id").asText("");
            branch = id.startsWith("refs/heads/") ? id.substring("refs/heads/".length()) : id;
        }
        List<String> reviewers = new ArrayList<>();
        pr.path("reviewers").forEach(r -> {
            String name = r.path("user").path("name").asText(null);
            if (name != null) {
                reviewers.add(name);
            }
        });
        JsonNode closed = pr.get("closedDate");
        return new PullRequest(pr.path("id").asLong(), pr.path("title").asText(""), text(pr.get("description")),
                pr.path("state").asText(""), branch, text(from.get("latestCommit")), sameRepo(from, to),
                pr.path("author").path("user").path("name").asText(""), pr.path("createdDate").asLong(),
                closed == null || !closed.canConvertToLong() ? null : closed.asLong(), reviewers, link(pr));
    }

    private static boolean sameRepo(JsonNode from, JsonNode to) {
        JsonNode a = from.path("repository");
        JsonNode b = to.path("repository");
        return a.path("slug").asText("").equalsIgnoreCase(b.path("slug").asText(""))
                && a.path("project").path("key").asText("").equalsIgnoreCase(b.path("project").path("key").asText(""));
    }

    private static String link(JsonNode pr) {
        return pr.path("links").path("self").path(0).path("href").asText(null);
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() || !node.isTextual() ? null : node.asText();
    }

    // --- Llamadas ---

    private URI repoUri(ResubmitConfig config, String tail) {
        return URI.create(config.baseUrl() + "/rest/api/1.0/projects/" + enc(config.projectKey()) + "/repos/"
                + enc(config.repoSlug()) + tail);
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** RP-06: sin respuesta, 502 «No hay contacto con Bitbucket». */
    private Transport.Reply call(ResubmitConfig config, String method, URI uri, String body) throws InterruptedException {
        Map<String, String> headers = body == null
                ? Map.of("Authorization", "Bearer " + config.token(), "Accept", "application/json")
                : Map.of("Authorization", "Bearer " + config.token(), "Accept", "application/json",
                "Content-Type", "application/json");
        try {
            return transport.send(method, uri, headers, body);
        } catch (IOException e) {
            throw new ApiError(502, "bitbucket_unreachable", "No hay contacto con Bitbucket");
        }
    }

    /** RP-06: el cuerpo de una respuesta 2xx, o el error para el usuario. */
    private static JsonNode ok(Transport.Reply reply) {
        if (reply.status() >= 200 && reply.status() < 300) {
            try {
                return JSON.readTree(reply.body() == null ? "{}" : reply.body());
            } catch (IOException e) {
                throw new ApiError(502, "bitbucket_error", "Bitbucket respondió algo que no es JSON");
            }
        }
        throw new ApiError(502, "bitbucket_error", message(reply));
    }

    /** RP-06 */
    static String message(Transport.Reply reply) {
        return switch (reply.status()) {
            case 401 -> "El token no es válido o ha caducado";
            case 403 -> "El token no tiene permiso sobre el repositorio";
            case 404 -> "No existe el proyecto o el repositorio";
            default -> {
                String first = null;
                try {
                    JsonNode errors = JSON.readTree(reply.body() == null ? "{}" : reply.body()).path("errors");
                    first = errors.path(0).path("message").asText(null);
                } catch (IOException e) {
                    // Sin cuerpo JSON: se dice el estado.
                }
                yield first == null || first.isBlank() ? "Bitbucket respondió con el error HTTP " + reply.status() : first;
            }
        };
    }
}
