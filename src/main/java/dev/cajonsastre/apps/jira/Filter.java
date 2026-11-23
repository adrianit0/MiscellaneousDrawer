package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import dev.cajonsastre.platform.ApiError;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * JR-26, JR-27: un filtro guardado, común a todos los tableros. Solo se guarda: lo aplica la interfaz sobre los tickets
 * ya consultados (JR-49), sin contactar con Jira. Un criterio null no se aplica.
 */
record Filter(long id, String name, Values statuses, Values priorities, Values assignees, Dates created, Dates updated) {

    /** «Es uno de» (include) o «No es ninguno de» (exclude) una lista de nombres; none es «Sin prioridad» o «Sin asignar». */
    record Values(String mode, List<String> values, boolean none) {
        Map<String, Object> view() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("mode", mode);
            out.put("values", values);
            out.put("none", none);
            return out;
        }
    }

    /** Días desde la fecha (más de y menos de) y un rango de días (desde y hasta, incluidos). */
    record Dates(Integer moreThanDays, Integer lessThanDays, String from, String to) {
        Map<String, Object> view() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("moreThanDays", moreThanDays);
            out.put("lessThanDays", lessThanDays);
            out.put("from", from);
            out.put("to", to);
            return out;
        }
    }

    /** JR-26 */
    static final int MAX_FILTERS = 30;
    /** JR-27 */
    static final int MAX_NAME = 40;
    static final int MAX_VALUES = 100;
    static final int MAX_VALUE = 255;
    static final int MAX_DAYS = 3650;
    private static final Pattern DATE = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}");

    /** JR-27: el filtro que describe body, con el identificador id (0 si es nuevo). */
    static Filter from(long id, JsonNode body) {
        if (body == null || !body.isObject()) {
            throw invalid("filter", "El filtro debe ser un objeto JSON");
        }
        String name = text(body.get("name"));
        if (name == null || name.length() > MAX_NAME) {
            throw invalid("name", "El nombre debe tener de 1 a " + MAX_NAME + " caracteres");
        }
        Values statuses = values(body.get("statuses"), "statuses", false);
        Values priorities = values(body.get("priorities"), "priorities", true);
        Values assignees = values(body.get("assignees"), "assignees", true);
        Dates created = dates(body.get("created"), "created");
        Dates updated = dates(body.get("updated"), "updated");
        if (statuses == null && priorities == null && assignees == null && created == null && updated == null) {
            throw invalid("criteria", "El filtro necesita al menos un criterio");
        }
        return new Filter(id, name, statuses, priorities, assignees, created, updated);
    }

    private static Values values(JsonNode node, String field, boolean allowNone) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isObject()) {
            throw invalid(field, "El criterio no es válido");
        }
        String mode = text(node.get("mode"));
        if (!"include".equals(mode) && !"exclude".equals(mode)) {
            throw invalid(field, "Elige «Es uno de» o «No es ninguno de»");
        }
        JsonNode noneNode = node.get("none");
        boolean none = noneNode != null && noneNode.isBoolean() && noneNode.asBoolean();
        if (noneNode != null && !noneNode.isNull() && !noneNode.isBoolean()) {
            throw invalid(field, "El criterio no es válido");
        }
        if (none && !allowNone) {
            throw invalid(field, "El criterio no es válido");
        }
        JsonNode list = node.get("values");
        if (list == null || list.isNull()) {
            list = JsonNodeFactory.instance.arrayNode();
        }
        if (!list.isArray() || list.size() > MAX_VALUES) {
            throw invalid(field, "La lista puede tener " + MAX_VALUES + " valores como mucho");
        }
        List<String> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode n : list) {
            String value = text(n);
            if (value == null || value.length() > MAX_VALUE) {
                throw invalid(field, "Un valor debe tener de 1 a " + MAX_VALUE + " caracteres");
            }
            if (!seen.add(value.toLowerCase(Locale.ROOT))) {
                throw invalid(field, "«" + value + "» está repetido");
            }
            out.add(value);
        }
        if (out.isEmpty() && !none) {
            throw invalid(field, "Elige al menos un valor");
        }
        return new Values(mode, List.copyOf(out), none);
    }

    private static Dates dates(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isObject()) {
            throw invalid(field, "El criterio no es válido");
        }
        Integer more = days(node.get("moreThanDays"), field);
        Integer less = days(node.get("lessThanDays"), field);
        LocalDate from = date(node.get("from"), field);
        LocalDate to = date(node.get("to"), field);
        if (more == null && less == null && from == null && to == null) {
            throw invalid(field, "Escribe al menos un número de días o una fecha");
        }
        if (more != null && less != null && more >= less) {
            throw invalid(field, "«Más de» debe ser menor que «Menos de»");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw invalid(field, "«Desde» no puede ser posterior a «Hasta»");
        }
        return new Dates(more, less, from == null ? null : from.toString(), to == null ? null : to.toString());
    }

    private static Integer days(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isIntegralNumber() || node.asLong() < 0 || node.asLong() > MAX_DAYS) {
            throw invalid(field, "Los días deben ser un número entero de 0 a " + MAX_DAYS);
        }
        return node.asInt();
    }

    private static LocalDate date(JsonNode node, String field) {
        if (node == null || node.isNull()) {
            return null;
        }
        String value = node.isTextual() ? node.asText() : "";
        if (!DATE.matcher(value).matches()) {
            throw invalid(field, "Una fecha no es válida");
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            throw invalid(field, "Una fecha no es válida");
        }
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isTextual()) {
            return null;
        }
        String value = node.asText().strip();
        return value.isEmpty() ? null : value;
    }

    static ApiError invalid(String field, String message) {
        return new ApiError(400, "invalid_filter", message, Map.of("field", field));
    }

    /** Lo que se guarda en definition: los criterios, con null en los que no tiene. */
    Map<String, Object> definition() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("statuses", statuses == null ? null : statuses.view());
        out.put("priorities", priorities == null ? null : priorities.view());
        out.put("assignees", assignees == null ? null : assignees.view());
        out.put("created", created == null ? null : created.view());
        out.put("updated", updated == null ? null : updated.view());
        return out;
    }

    /** JR-26: lo que devuelve la API. */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", name);
        out.putAll(definition());
        return out;
    }
}
