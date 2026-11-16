package dev.cajonsastre.apps.gestask;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * GT-01: lo que el usuario escribe a mano en «Conexión». Un valor null es un campo vacío. Nada de esto tiene valor en
 * el código ni en el repositorio (S-32).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record GestaskConfig(String supabaseUrl, String publishableKey, String email, String password) {

    static final GestaskConfig EMPTY = new GestaskConfig(null, null, null, null);

    /** GT-03: todos hacen falta para llamar a Supabase. */
    static final List<String> FIELDS = List.of("supabaseUrl", "publishableKey", "email", "password");

    private static final Map<String, String> LABELS = Map.of(
            "supabaseUrl", "URL de Supabase",
            "publishableKey", "Clave publicable",
            "email", "Email",
            "password", "Contraseña");

    private static final int MAX_URL = 200;
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1");
    private static final Pattern KEY = Pattern.compile("[\\x21-\\x7e]{1,500}");
    private static final Pattern EMAIL = Pattern.compile("[^\\s\\p{Cntrl}@]+@[^\\s\\p{Cntrl}@]+");
    private static final Pattern PASSWORD = Pattern.compile("\\P{Cntrl}{1,200}");

    static String label(String key) {
        return LABELS.getOrDefault(key, key);
    }

    /**
     * GT-01, GT-02: la conexión que resulta de guardar body. Un campo que no viene queda vacío, salvo la contraseña:
     * si no viene o es null se conserva la guardada, y la cadena vacía la borra.
     */
    static GestaskConfig from(JsonNode body, GestaskConfig saved) {
        if (body == null || !body.isObject()) {
            throw new ApiError(400, "invalid_config", "La conexión debe ser un objeto JSON");
        }
        String password = saved.password();
        JsonNode p = body.get("password");
        if (p != null && !p.isNull()) {
            if (!p.isTextual()) {
                throw invalid("password", "debe ser un texto");
            }
            password = p.asText().isEmpty() ? null : p.asText();
        }
        String url = text(body, "supabaseUrl");
        if (url != null) {
            // GT-01: la barra final se quita.
            url = url.replaceAll("/+$", "");
        }
        GestaskConfig config = new GestaskConfig(url, text(body, "publishableKey"), text(body, "email"), password);
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

    /** GT-01, GT-04: el formato de cada valor escrito. Lo vacío no se comprueba: se puede guardar a medias. */
    void validate() {
        if (supabaseUrl != null && !validUrl(supabaseUrl)) {
            throw invalid("supabaseUrl", "debe ser https://<servidor>, sin ruta ni parámetros, y tener hasta "
                    + MAX_URL + " caracteres");
        }
        check("publishableKey", publishableKey, KEY, "debe tener de 1 a 500 caracteres, sin espacios");
        if (email != null && (email.length() < 3 || email.length() > 254 || !EMAIL.matcher(email).matches())) {
            throw invalid("email", "debe ser una dirección de correo, de 3 a 254 caracteres");
        }
        check("password", password, PASSWORD, "debe tener de 1 a 200 caracteres");
    }

    /** GT-01: https, o http solo para un Supabase local; solo esquema, servidor y puerto. */
    private static boolean validUrl(String value) {
        if (value.length() > MAX_URL) {
            return false;
        }
        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException e) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getRawPath() == null || uri.getRawPath().isEmpty())) {
            return false;
        }
        return scheme.equals("https") || (scheme.equals("http") && LOCAL_HOSTS.contains(host.toLowerCase(Locale.ROOT)));
    }

    private static void check(String key, String value, Pattern format, String rule) {
        if (value != null && !format.matcher(value).matches()) {
            throw invalid(key, rule);
        }
    }

    private static ApiError invalid(String key, String rule) {
        return new ApiError(400, "invalid_config", "«" + label(key) + "» " + rule, Map.of("field", key));
    }

    private String value(String key) {
        return switch (key) {
            case "supabaseUrl" -> supabaseUrl;
            case "publishableKey" -> publishableKey;
            case "email" -> email;
            case "password" -> password;
            default -> throw new IllegalArgumentException("Campo desconocido: " + key);
        };
    }

    /** GT-03: los campos que siguen vacíos. */
    List<String> missing() {
        return FIELDS.stream().filter(k -> value(k) == null).toList();
    }

    /** GT-03: 409 si falta algún campo. */
    void requireComplete() {
        List<String> missing = missing();
        if (!missing.isEmpty()) {
            throw new ApiError(409, "not_configured",
                    "Falta configurar: " + String.join(", ", missing.stream().map(GestaskConfig::label).toList()),
                    Map.of("missing", missing));
        }
    }

    /** GT-02: lo que sale del servidor: todo menos la contraseña, y lo que falta (GT-03). */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("supabaseUrl", supabaseUrl);
        out.put("publishableKey", publishableKey);
        out.put("email", email);
        out.put("passwordSet", password != null);
        out.put("missing", missing());
        return out;
    }
}
