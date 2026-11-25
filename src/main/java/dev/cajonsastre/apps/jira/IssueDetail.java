package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * JR-61 a JR-63: el detalle de un ticket a partir de lo que da Jira. La descripción y el cuerpo de los comentarios van
 * en ADF tal como los da Jira; la interfaz los pinta sin interpretar HTML (JR-74).
 */
final class IssueDetail {

    /** JR-63: una clave de proyecto (JR-12), un guion y un número que no empieza por cero. */
    static final Pattern ISSUE_KEY = Pattern.compile(Board.PROJECT_KEY.pattern() + "-[1-9][0-9]{0,9}");
    /** JR-63 */
    static final Pattern ATTACHMENT_ID = Board.STATUS_ID;

    private IssueDetail() {
    }

    /** JR-61 */
    static Map<String, Object> view(JsonNode issue, Jira.Comments comments, Instant fetchedAt) {
        JsonNode f = issue.path("fields");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", issue.path("key").asText());
        out.put("summary", f.path("summary").asText(""));
        out.put("project", projectOf(issue.path("key").asText()));
        out.put("status", status(f.path("status")));
        out.put("type", name(f.get("issuetype")));
        JsonNode priority = f.get("priority");
        if (priority != null && priority.hasNonNull("id")) {
            out.put("priority", Map.of("id", priority.path("id").asText(),
                    "name", priority.path("name").asText(priority.path("id").asText())));
        } else {
            out.put("priority", null);
        }
        out.put("assignee", person(f.get("assignee")));
        out.put("reporter", person(f.get("reporter")));
        out.put("created", f.path("created").asText(null));
        out.put("updated", f.path("updated").asText(null));
        JsonNode description = f.get("description");
        out.put("description", description == null || !description.isObject() ? null : description);
        JsonNode parent = f.get("parent");
        out.put("parent", parent == null || !parent.hasNonNull("key") ? null : brief(parent));

        List<Map<String, Object>> subtasks = new ArrayList<>();
        f.path("subtasks").forEach(s -> {
            if (s.hasNonNull("key")) {
                subtasks.add(brief(s));
            }
        });
        out.put("subtasks", subtasks);

        // JR-61: la relación vista desde este ticket.
        List<Map<String, Object>> links = new ArrayList<>();
        for (JsonNode link : f.path("issuelinks")) {
            JsonNode type = link.path("type");
            if (link.path("outwardIssue").hasNonNull("key")) {
                links.add(Map.of("relation", type.path("outward").asText(type.path("name").asText("")),
                        "issue", brief(link.get("outwardIssue"))));
            } else if (link.path("inwardIssue").hasNonNull("key")) {
                links.add(Map.of("relation", type.path("inward").asText(type.path("name").asText("")),
                        "issue", brief(link.get("inwardIssue"))));
            }
        }
        out.put("links", links);

        List<Map<String, Object>> attachments = new ArrayList<>();
        for (JsonNode a : f.path("attachment")) {
            String id = a.path("id").asText("");
            if (!ATTACHMENT_ID.matcher(id).matches()) {
                continue;
            }
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", id);
            view.put("filename", a.path("filename").asText(id));
            view.put("mimeType", a.path("mimeType").asText(null));
            view.put("size", a.path("size").asLong(0));
            view.put("author", person(a.get("author")));
            view.put("created", a.path("created").asText(null));
            attachments.add(view);
        }
        out.put("attachments", attachments);

        List<String> labels = new ArrayList<>();
        f.path("labels").forEach(l -> {
            if (l.isTextual()) {
                labels.add(l.asText());
            }
        });
        out.put("labels", labels);
        List<String> components = new ArrayList<>();
        f.path("components").forEach(c -> {
            if (c.hasNonNull("name")) {
                components.add(c.path("name").asText());
            }
        });
        out.put("components", components);

        List<Map<String, Object>> list = new ArrayList<>();
        for (JsonNode c : comments.comments()) {
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", c.path("id").asText(""));
            view.put("author", person(c.get("author")));
            view.put("created", c.path("created").asText(null));
            view.put("updated", c.path("updated").asText(null));
            JsonNode body = c.get("body");
            view.put("body", body == null || !body.isObject() ? null : body);
            list.add(view);
        }
        out.put("comments", list);
        out.put("commentsTruncated", comments.truncated());
        out.put("fetchedAt", fetchedAt.toString());
        return out;
    }

    /** JR-61: clave, resumen, estado con su categoría y tipo. */
    private static Map<String, Object> brief(JsonNode issue) {
        JsonNode f = issue.path("fields");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", issue.path("key").asText());
        out.put("summary", f.path("summary").asText(""));
        out.put("status", status(f.path("status")));
        out.put("type", name(f.get("issuetype")));
        return out;
    }

    /** JR-11: la categoría es new, indeterminate o done. */
    private static Map<String, Object> status(JsonNode status) {
        return Map.of("name", status.path("name").asText(""),
                "category", status.path("statusCategory").path("key").asText("indeterminate"));
    }

    private static String name(JsonNode node) {
        return node == null || !node.hasNonNull("name") ? null : node.path("name").asText();
    }

    private static String person(JsonNode node) {
        return node == null || !node.hasNonNull("displayName") ? null : node.path("displayName").asText();
    }

    private static String projectOf(String key) {
        int dash = key.lastIndexOf('-');
        return dash < 0 ? key : key.substring(0, dash);
    }
}
