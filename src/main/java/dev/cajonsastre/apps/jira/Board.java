package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import dev.cajonsastre.platform.ApiError;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * JR-14: un tablero, con sus proyectos y sus columnas en orden. Cada columna tiene pares proyecto-estado por
 * identificador, con el nombre que vio la interfaz para mostrarlo si Jira deja de tenerlo (JR-15) y su color (JR-18).
 * El tablero tiene además sus prioridades con su color (JR-17).
 */
record Board(long id, String name, List<String> projects, List<Column> columns, List<Priority> priorities) {

    /** Un estado de un proyecto, por su identificador, con su color de la paleta. */
    record StatusRef(String project, String id, String name, String color) {
        String pair() {
            return project + "/" + id;
        }
    }

    record Column(String name, List<StatusRef> statuses) {
    }

    /** JR-17: una prioridad de Jira, por su identificador, con su color de la paleta. */
    record Priority(String id, String name, String color) {
    }

    /** JR-18: los colores que se pueden elegir. */
    static final List<String> PALETTE = List.of("gray", "blue", "green", "violet", "orange", "cyan", "gold", "red");
    /** JR-18: el color de lo que no tiene ninguno guardado. */
    static final String DEFAULT_COLOR = "gray";

    /** JR-13 */
    static final int MAX_BOARDS = 20;
    /** JR-14 */
    static final int MAX_NAME = 60;
    static final int MAX_PROJECTS = 10;
    static final int MAX_COLUMNS = 12;
    static final int MAX_COLUMN_NAME = 40;
    static final int MAX_STATUSES = 100;
    static final int MAX_STATUS_NAME = 255;
    /** JR-17 */
    static final int MAX_PRIORITIES = 20;
    /** JR-12: así ningún valor guardado puede cambiar el JQL. */
    static final Pattern PROJECT_KEY = Pattern.compile("[A-Z][A-Z0-9_]{1,19}");
    static final Pattern STATUS_ID = Pattern.compile("[0-9]{1,18}");
    /** JR-17, JR-19 */
    static final Pattern PRIORITY_ID = STATUS_ID;

    /** La columna final: la de los cerrados (JR-21). */
    Column last() {
        return columns.get(columns.size() - 1);
    }

    /**
     * JR-14: el tablero que describe body, con el identificador id (0 si es nuevo). Lo que no cumple el formato
     * responde 400 invalid_board con el campo.
     */
    static Board from(long id, JsonNode body) {
        if (body == null || !body.isObject()) {
            throw invalid("board", "El tablero debe ser un objeto JSON");
        }
        String name = text(body.get("name"));
        if (name == null || name.length() > MAX_NAME) {
            throw invalid("name", "El nombre debe tener de 1 a " + MAX_NAME + " caracteres");
        }

        JsonNode p = body.get("projects");
        if (p == null || !p.isArray() || p.isEmpty() || p.size() > MAX_PROJECTS) {
            throw invalid("projects", "El tablero debe tener de 1 a " + MAX_PROJECTS + " proyectos");
        }
        List<String> projects = new ArrayList<>();
        for (JsonNode n : p) {
            String key = n.isTextual() ? n.asText() : null;
            if (key == null || !PROJECT_KEY.matcher(key).matches()) {
                throw invalid("projects", "Una clave de proyecto no es válida");
            }
            if (projects.contains(key)) {
                throw invalid("projects", "El proyecto " + key + " está repetido");
            }
            projects.add(key);
        }

        JsonNode c = body.get("columns");
        if (c == null || !c.isArray() || c.isEmpty() || c.size() > MAX_COLUMNS) {
            throw invalid("columns", "El tablero debe tener de 1 a " + MAX_COLUMNS + " columnas");
        }
        List<Column> columns = new ArrayList<>();
        Set<String> columnNames = new HashSet<>();
        Set<String> pairs = new HashSet<>();
        for (JsonNode col : c) {
            String colName = col.isObject() ? text(col.get("name")) : null;
            if (colName == null || colName.length() > MAX_COLUMN_NAME) {
                throw invalid("columns", "El nombre de una columna debe tener de 1 a " + MAX_COLUMN_NAME + " caracteres");
            }
            if (!columnNames.add(colName.toLowerCase(Locale.ROOT))) {
                throw invalid("columns", "La columna «" + colName + "» está repetida");
            }
            JsonNode s = col.get("statuses");
            if (s == null || s.isNull()) {
                s = JsonNodeFactory.instance.arrayNode();
            }
            if (!s.isArray() || s.size() > MAX_STATUSES) {
                throw invalid("columns", "Una columna puede tener " + MAX_STATUSES + " estados como mucho");
            }
            List<StatusRef> statuses = new ArrayList<>();
            for (JsonNode st : s) {
                String project = st.isObject() ? text(st.get("project")) : null;
                String statusId = st.isObject() ? text(st.get("id")) : null;
                String statusName = st.isObject() ? text(st.get("name")) : null;
                if (project == null || !projects.contains(project)) {
                    throw invalid("columns", "Un estado de «" + colName + "» es de un proyecto que no está en el tablero");
                }
                if (statusId == null || !STATUS_ID.matcher(statusId).matches()) {
                    throw invalid("columns", "Un estado de «" + colName + "» no tiene un identificador válido");
                }
                if (statusName == null || statusName.length() > MAX_STATUS_NAME) {
                    throw invalid("columns", "Un estado de «" + colName + "» no tiene nombre");
                }
                String color = color(st.get("color"), "columns", "Un estado de «" + colName + "» tiene un color que no es de la paleta");
                StatusRef ref = new StatusRef(project, statusId, statusName, color);
                if (!pairs.add(ref.pair())) {
                    throw invalid("columns", "El estado «" + statusName + "» de " + project + " está en más de una columna");
                }
                statuses.add(ref);
            }
            columns.add(new Column(colName, List.copyOf(statuses)));
        }
        return new Board(id, name, List.copyOf(projects), List.copyOf(columns), priorities(body.get("priorities")));
    }

    /** JR-17: las prioridades del tablero; si no vienen, ninguna (tableros guardados antes de JR-17). */
    private static List<Priority> priorities(JsonNode p) {
        if (p == null || p.isNull()) {
            return List.of();
        }
        if (!p.isArray() || p.size() > MAX_PRIORITIES) {
            throw invalid("priorities", "El tablero puede tener " + MAX_PRIORITIES + " prioridades como mucho");
        }
        List<Priority> out = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonNode n : p) {
            String pid = n.isObject() ? text(n.get("id")) : null;
            String pname = n.isObject() ? text(n.get("name")) : null;
            if (pid == null || !PRIORITY_ID.matcher(pid).matches()) {
                throw invalid("priorities", "Una prioridad no tiene un identificador válido");
            }
            if (pname == null || pname.length() > MAX_STATUS_NAME) {
                throw invalid("priorities", "Una prioridad no tiene nombre");
            }
            if (!ids.add(pid)) {
                throw invalid("priorities", "La prioridad «" + pname + "» está repetida");
            }
            out.add(new Priority(pid, pname, color(n.get("color"), "priorities",
                    "La prioridad «" + pname + "» tiene un color que no es de la paleta")));
        }
        return List.copyOf(out);
    }

    /** JR-18: un color de la paleta; si falta o es null, el gris. */
    private static String color(JsonNode node, String field, String message) {
        if (node == null || node.isNull()) {
            return DEFAULT_COLOR;
        }
        if (!node.isTextual() || !PALETTE.contains(node.asText())) {
            throw invalid(field, message);
        }
        return node.asText();
    }

    /** JR-17: la prioridad del tablero con ese identificador, si la tiene. */
    Optional<Priority> priority(String priorityId) {
        return priorities.stream().filter(p -> p.id().equals(priorityId)).findFirst();
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        String value = node.asText().strip();
        return value.isEmpty() ? null : value;
    }

    static ApiError invalid(String field, String message) {
        return new ApiError(400, "invalid_board", message, Map.of("field", field));
    }

    /** Lo que se guarda en definition: proyectos, columnas y prioridades. */
    Map<String, Object> definition() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("projects", projects);
        out.put("columns", columns.stream().map(c -> {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("name", c.name());
            col.put("statuses", c.statuses().stream()
                    .map(s -> Map.of("project", s.project(), "id", s.id(), "name", s.name(), "color", s.color())).toList());
            return col;
        }).toList());
        out.put("priorities", priorities.stream()
                .map(p -> Map.of("id", p.id(), "name", p.name(), "color", p.color())).toList());
        return out;
    }

    /** JR-13: lo que devuelve la API. */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.putAll(definition());
        return out;
    }
}
