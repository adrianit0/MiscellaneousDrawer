package dev.cajonsastre.apps.processes;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.util.Map;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * CP-01: qué cierra un perfil: los procesos cuya línea de comandos contiene el patrón y los que escuchan en el rango de
 * puertos. Un valor null es un campo vacío.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record Profile(int id, String name, String processPattern, Integer portFrom, Integer portTo) {

    static final int MAX_NAME = 60;
    static final int MAX_PATTERN = 200;
    static final int MAX_PORT = 65535;

    private static final Map<String, String> LABELS = Map.of(
            "name", "Nombre",
            "processPattern", "Patrón de procesos",
            "portFrom", "Puerto inicial",
            "portTo", "Puerto final");

    /** CP-03: el perfil que resulta de guardar body con ese identificador. */
    static Profile from(JsonNode body, int id) {
        if (body == null || !body.isObject()) {
            throw new ApiError(400, "invalid_profile", "El perfil debe ser un objeto JSON");
        }
        Profile profile = new Profile(id, text(body, "name"), text(body, "processPattern"), port(body, "portFrom"),
                port(body, "portTo"));
        profile.validate();
        return profile;
    }

    private static String text(JsonNode body, String key) {
        JsonNode n = body.get(key);
        if (n == null || n.isNull()) {
            return null;
        }
        if (!n.isTextual()) {
            throw invalid(key, "debe ser un texto");
        }
        String value = n.asText().strip();
        return value.isEmpty() ? null : value;
    }

    private static Integer port(JsonNode body, String key) {
        JsonNode n = body.get(key);
        if (n == null || n.isNull()) {
            return null;
        }
        if (!n.isIntegralNumber() || !n.canConvertToInt()) {
            throw invalid(key, "debe ser un número entero de 1 a " + MAX_PORT);
        }
        return n.asInt();
    }

    /** CP-03. También pasa por aquí un fichero tocado a mano (CP-02). */
    void validate() {
        if (name == null || name.isBlank() || name.length() > MAX_NAME || !name.equals(name.strip())) {
            throw invalid("name", "debe tener de 1 a " + MAX_NAME + " caracteres");
        }
        if (processPattern != null) {
            if (processPattern.isEmpty() || processPattern.length() > MAX_PATTERN) {
                throw invalid("processPattern", "debe tener de 1 a " + MAX_PATTERN + " caracteres");
            }
            Pattern regex;
            try {
                regex = Pattern.compile(processPattern);
            } catch (PatternSyntaxException e) {
                throw invalid("processPattern", "no es una expresión regular válida");
            }
            if (regex.matcher("").find()) {
                throw invalid("processPattern", "coincide con el texto vacío: cerraría todos los procesos");
            }
        }
        checkPort("portFrom", portFrom);
        checkPort("portTo", portTo);
        if (portFrom == null && portTo != null) {
            throw invalid("portFrom", "hace falta si se escribe el puerto final");
        }
        if (portFrom != null && portTo == null) {
            throw invalid("portTo", "hace falta si se escribe el puerto inicial");
        }
        if (portFrom != null && portFrom > portTo) {
            throw invalid("portTo", "no puede ser menor que el puerto inicial");
        }
        if (processPattern == null && portFrom == null) {
            throw invalid("processPattern", "o un rango de puertos: el perfil necesita al menos una de las dos cosas");
        }
    }

    private static void checkPort(String key, Integer value) {
        if (value != null && (value < 1 || value > MAX_PORT)) {
            throw invalid(key, "debe ser un número entero de 1 a " + MAX_PORT);
        }
    }

    private static ApiError invalid(String key, String rule) {
        return new ApiError(400, "invalid_profile", "«" + LABELS.get(key) + "» " + rule, Map.of("field", key));
    }

    /** CP-11: el patrón compilado; null si el perfil no tiene. */
    Pattern regex() {
        return processPattern == null ? null : Pattern.compile(processPattern);
    }

    /** CP-12 */
    boolean inRange(int port) {
        return portFrom != null && port >= portFrom && port <= portTo;
    }
}
