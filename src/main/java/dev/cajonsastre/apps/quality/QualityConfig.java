package dev.cajonsastre.apps.quality;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * CD-01: lo que el usuario escribe a mano en «Configuración». Un valor null es un campo vacío. Nada de esto tiene valor
 * en el código ni en el repositorio (S-32).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record QualityConfig(String containerName, String rootPassword, String databaseName, String qualitySqlDir) {

    static final QualityConfig EMPTY = new QualityConfig(null, null, null, null);

    /** CD-03: todos hacen falta para comprobar. */
    static final List<String> FIELDS = List.of("containerName", "rootPassword", "databaseName", "qualitySqlDir");

    private static final Map<String, String> LABELS = Map.of(
            "containerName", "Contenedor",
            "rootPassword", "Contraseña de root",
            "databaseName", "Base de datos",
            "qualitySqlDir", "Carpeta de scripts de calidad");

    private static final Pattern CONTAINER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_.-]{0,62}");
    private static final Pattern DATABASE = Pattern.compile("[A-Za-z0-9_$][A-Za-z0-9_$-]{0,63}");
    private static final Pattern PASSWORD = Pattern.compile("\\P{Cntrl}{1,200}");

    static String label(String key) {
        return LABELS.getOrDefault(key, key);
    }

    /**
     * CD-01, CD-02: la configuración que resulta de guardar body. Un campo que no viene queda vacío, salvo la
     * contraseña: si no viene o es null se conserva la guardada, y la cadena vacía la borra.
     */
    static QualityConfig from(JsonNode body, QualityConfig saved) {
        if (body == null || !body.isObject()) {
            throw new ApiError(400, "invalid_config", "La configuración debe ser un objeto JSON");
        }
        String password = saved.rootPassword();
        JsonNode p = body.get("rootPassword");
        if (p != null && !p.isNull()) {
            if (!p.isTextual()) {
                throw invalid("rootPassword", "debe ser un texto");
            }
            password = p.asText().isEmpty() ? null : p.asText();
        }
        QualityConfig config = new QualityConfig(text(body, "containerName"), password, text(body, "databaseName"),
                text(body, "qualitySqlDir"));
        config.validate();
        return config;
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

    /** CD-01: el formato de cada valor escrito. Lo vacío no se comprueba: se puede guardar a medias. */
    void validate() {
        check("containerName", containerName, CONTAINER,
                "solo admite letras, cifras, _ . y -, empieza por letra o cifra y tiene hasta 63 caracteres");
        check("rootPassword", rootPassword, PASSWORD, "debe tener de 1 a 200 caracteres");
        check("databaseName", databaseName, DATABASE,
                "solo admite letras, cifras y _ $ -, no empieza por - y tiene hasta 64 caracteres");
        if (qualitySqlDir != null && !absolute(qualitySqlDir)) {
            throw invalid("qualitySqlDir", "debe ser una ruta absoluta");
        }
    }

    private static void check(String key, String value, Pattern format, String rule) {
        if (value != null && !format.matcher(value).matches()) {
            throw invalid(key, rule);
        }
    }

    private static boolean absolute(String value) {
        try {
            return Path.of(value).isAbsolute();
        } catch (InvalidPathException e) {
            return false;
        }
    }

    private static ApiError invalid(String key, String rule) {
        return new ApiError(400, "invalid_config", "«" + label(key) + "» " + rule, Map.of("field", key));
    }

    private String value(String key) {
        return switch (key) {
            case "containerName" -> containerName;
            case "rootPassword" -> rootPassword;
            case "databaseName" -> databaseName;
            case "qualitySqlDir" -> qualitySqlDir;
            default -> throw new IllegalArgumentException("Campo desconocido: " + key);
        };
    }

    /** CD-03: los campos que siguen vacíos. */
    List<String> missing() {
        return FIELDS.stream().filter(k -> value(k) == null).toList();
    }

    /** CD-03, CD-10: 409 si falta alguno de keys. */
    void require(List<String> keys) {
        List<String> missing = keys.stream().filter(k -> value(k) == null).toList();
        if (!missing.isEmpty()) {
            throw new ApiError(409, "not_configured",
                    "Falta configurar: " + String.join(", ", missing.stream().map(QualityConfig::label).toList()),
                    Map.of("missing", missing));
        }
    }

    /** CD-02: lo que sale del servidor: todo menos la contraseña, y lo que falta (CD-03). */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("containerName", containerName);
        out.put("databaseName", databaseName);
        out.put("qualitySqlDir", qualitySqlDir);
        out.put("rootPasswordSet", rootPassword != null);
        out.put("missing", missing());
        return out;
    }
}
