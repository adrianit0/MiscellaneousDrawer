package dev.cajonsastre.apps.jira;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * JR-01, JR-02: la conexión que el usuario escribe en «Conexión». Un valor null es un campo vacío. Nada de esto tiene
 * valor en el código ni en el repositorio (S-32).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record JiraConfig(String siteUrl, String email, String token) {

    static final JiraConfig EMPTY = new JiraConfig(null, null, null);

    /** JR-04: los campos, en el orden del formulario. Todos son obligatorios. */
    static final List<String> REQUIRED = List.of("siteUrl", "email", "token");

    private static final Map<String, String> LABELS = Map.of("siteUrl", "Sitio", "email", "Email", "token", "Token");
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1");
    private static final Pattern SITE = Pattern.compile("[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.atlassian\\.net");
    private static final Pattern EMAIL = Pattern.compile("[^\\s@\\p{Cntrl}]+@[^\\s@\\p{Cntrl}]+");
    private static final Pattern TOKEN = Pattern.compile("[\\x21-\\x7e]{1,500}");
    private static final int MAX_EMAIL = 254;

    static String label(String key) {
        return LABELS.getOrDefault(key, key);
    }

    /**
     * JR-02, JR-03: la conexión que resulta de guardar body. Un campo que no viene queda vacío, salvo el token: si no
     * viene o es null se conserva el guardado, y la cadena vacía lo borra.
     */
    static JiraConfig from(JsonNode body, JiraConfig saved) {
        if (body == null || !body.isObject()) {
            throw new ApiError(400, "invalid_config", "La conexión debe ser un objeto JSON");
        }
        String token = saved.token();
        JsonNode t = body.get("token");
        if (t != null && !t.isNull()) {
            if (!t.isTextual()) {
                throw invalid("token", "debe ser un texto");
            }
            token = t.asText().strip().isEmpty() ? null : t.asText().strip();
        }
        String site = text(body, "siteUrl");
        if (site != null) {
            site = site.replaceAll("/+$", "");
        }
        JiraConfig config = new JiraConfig(site, text(body, "email"), token);
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

    /** JR-02: el formato de cada valor escrito. Lo vacío no se comprueba: se puede guardar a medias. */
    void validate() {
        if (siteUrl != null && !validSite(siteUrl)) {
            throw invalid("siteUrl", "debe ser https://<sitio>.atlassian.net, sin ruta ni parámetros");
        }
        if (email != null && !(email.length() <= MAX_EMAIL && EMAIL.matcher(email).matches())) {
            throw invalid("email", "debe ser un email, sin espacios");
        }
        if (token != null && !TOKEN.matcher(token).matches()) {
            throw invalid("token", "debe tener de 1 a 500 caracteres, sin espacios");
        }
    }

    /** JR-02: https://<sitio>.atlassian.net, o http://localhost:<puerto> para las pruebas. Sin ruta. */
    static boolean validSite(String value) {
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
        host = host.toLowerCase(Locale.ROOT);
        if (scheme.equals("https")) {
            return uri.getPort() == -1 && SITE.matcher(host).matches();
        }
        return scheme.equals("http") && LOCAL_HOSTS.contains(host) && uri.getPort() > 0;
    }

    private static ApiError invalid(String key, String rule) {
        return new ApiError(400, "invalid_config", "«" + label(key) + "» " + rule, Map.of("field", key));
    }

    private String value(String key) {
        return switch (key) {
            case "siteUrl" -> siteUrl;
            case "email" -> email;
            case "token" -> token;
            default -> throw new IllegalArgumentException("Campo desconocido: " + key);
        };
    }

    /** JR-04: los campos que siguen vacíos. */
    List<String> missing() {
        return REQUIRED.stream().filter(k -> value(k) == null).toList();
    }

    /** JR-04: 409 si falta alguno, sin contactar con Jira. */
    void requireComplete() {
        List<String> missing = missing();
        if (!missing.isEmpty()) {
            throw new ApiError(409, "not_configured",
                    "Falta configurar: " + String.join(", ", missing.stream().map(JiraConfig::label).toList()),
                    Map.of("missing", missing));
        }
    }

    /** JR-05: la cabecera de autenticación básica. */
    String authorization() {
        return "Basic " + Base64.getEncoder().encodeToString((email + ":" + token).getBytes(StandardCharsets.UTF_8));
    }

    /** JR-03, JR-04: lo que sale del servidor: todo menos el token. */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("siteUrl", siteUrl);
        out.put("email", email);
        out.put("tokenSet", token != null);
        out.put("missing", missing());
        return out;
    }

    /** S-21: nunca con el token, ni por accidente en un mensaje. */
    @Override
    public String toString() {
        return "JiraConfig[tokenSet=" + (token != null) + "]";
    }
}
