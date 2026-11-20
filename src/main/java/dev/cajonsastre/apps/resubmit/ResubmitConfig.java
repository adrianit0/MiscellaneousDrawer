package dev.cajonsastre.apps.resubmit;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * RP-01, RP-02: la conexión que el usuario escribe en «Conexión». Un valor null es un campo vacío. Nada de esto tiene
 * valor en el código ni en el repositorio (S-32).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record ResubmitConfig(String baseUrl, String token, String projectKey, String repoSlug, String username, String dir,
                      String targetBranch, String branchPrefix) {

    static final ResubmitConfig EMPTY = new ResubmitConfig(null, null, null, null, null, null, null, null);
    static final String DEFAULT_TARGET = "hotfix";
    static final String DEFAULT_PREFIX = "bug/";

    /** RP-04: los obligatorios, en el orden del formulario. */
    static final List<String> REQUIRED = List.of("baseUrl", "token", "projectKey", "repoSlug", "username", "dir");

    private static final Map<String, String> LABELS = Map.of(
            "baseUrl", "URL de Bitbucket",
            "token", "Token",
            "projectKey", "Proyecto",
            "repoSlug", "Repositorio",
            "username", "Usuario",
            "dir", "Carpeta",
            "targetBranch", "Rama destino",
            "branchPrefix", "Prefijo de rama");

    private static final int MAX_URL = 200;
    private static final int MAX_DIR = 500;
    private static final int MAX_PREFIX = 50;
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1");
    private static final Pattern TOKEN = Pattern.compile("[\\x21-\\x7e]{1,500}");
    private static final Pattern PROJECT = Pattern.compile("[A-Za-z0-9_~-]{1,128}");
    private static final Pattern SLUG = Pattern.compile("[A-Za-z0-9._-]{1,128}");
    private static final Pattern USER = Pattern.compile("[^\\s\\p{Cntrl}]{1,255}");

    static String label(String key) {
        return LABELS.getOrDefault(key, key);
    }

    /** RP-01: la rama destino, con su valor por defecto. */
    String target() {
        return targetBranch == null ? DEFAULT_TARGET : targetBranch;
    }

    /** RP-01: el prefijo de las ramas, con su valor por defecto. */
    String prefix() {
        return branchPrefix == null ? DEFAULT_PREFIX : branchPrefix;
    }

    /**
     * RP-02, RP-03: la conexión que resulta de guardar body. Un campo que no viene queda vacío, salvo el token: si no
     * viene o es null se conserva el guardado, y la cadena vacía lo borra.
     */
    static ResubmitConfig from(JsonNode body, ResubmitConfig saved) {
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
        String url = text(body, "baseUrl");
        if (url != null) {
            url = url.replaceAll("/+$", "");
        }
        ResubmitConfig config = new ResubmitConfig(url, token, text(body, "projectKey"), text(body, "repoSlug"),
                text(body, "username"), text(body, "dir"), text(body, "targetBranch"), text(body, "branchPrefix"));
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

    /** RP-02: el formato de cada valor escrito. Lo vacío no se comprueba: se puede guardar a medias. */
    void validate() {
        if (baseUrl != null && !validUrl(baseUrl)) {
            throw invalid("baseUrl", "debe ser https://<servidor>[/ruta], sin usuario ni parámetros, y tener hasta "
                    + MAX_URL + " caracteres");
        }
        check("token", token, TOKEN, "debe tener de 1 a 500 caracteres, sin espacios");
        check("projectKey", projectKey, PROJECT, "solo admite letras, números, _, - y ~ (hasta 128)");
        check("repoSlug", repoSlug, SLUG, "solo admite letras, números, ., _ y - (hasta 128)");
        check("username", username, USER, "debe tener de 1 a 255 caracteres, sin espacios");
        if (dir != null && !(dir.length() <= MAX_DIR && dir.chars().noneMatch(Character::isISOControl) && absolute(dir))) {
            throw invalid("dir", "debe ser una ruta absoluta de hasta " + MAX_DIR + " caracteres");
        }
        if (targetBranch != null && !Branches.valid(targetBranch)) {
            throw invalid("targetBranch", "no es un nombre de rama válido");
        }
        if (branchPrefix != null && !Branches.validPrefix(branchPrefix, MAX_PREFIX)) {
            throw invalid("branchPrefix", "no es un prefijo de rama válido (hasta " + MAX_PREFIX + " caracteres)");
        }
    }

    /** RP-02: https, o http solo en local; sin usuario, parámetros ni fragmento. Admite una ruta. */
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
        if (host == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            return false;
        }
        return scheme.equals("https") || (scheme.equals("http") && LOCAL_HOSTS.contains(host.toLowerCase(Locale.ROOT)));
    }

    private static boolean absolute(String dir) {
        try {
            return Path.of(dir).isAbsolute();
        } catch (InvalidPathException e) {
            return false;
        }
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
            case "baseUrl" -> baseUrl;
            case "token" -> token;
            case "projectKey" -> projectKey;
            case "repoSlug" -> repoSlug;
            case "username" -> username;
            case "dir" -> dir;
            default -> throw new IllegalArgumentException("Campo desconocido: " + key);
        };
    }

    /** RP-04: los obligatorios que siguen vacíos. */
    List<String> missing() {
        return REQUIRED.stream().filter(k -> value(k) == null).toList();
    }

    /** RP-04: 409 si falta algún obligatorio. */
    void requireComplete() {
        List<String> missing = missing();
        if (!missing.isEmpty()) {
            throw new ApiError(409, "not_configured",
                    "Falta configurar: " + String.join(", ", missing.stream().map(ResubmitConfig::label).toList()),
                    Map.of("missing", missing));
        }
    }

    /** RP-03, RP-04: lo que sale del servidor: todo menos el token. */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("baseUrl", baseUrl);
        out.put("projectKey", projectKey);
        out.put("repoSlug", repoSlug);
        out.put("username", username);
        out.put("dir", dir);
        out.put("targetBranch", targetBranch);
        out.put("branchPrefix", branchPrefix);
        out.put("tokenSet", token != null);
        out.put("missing", missing());
        return out;
    }

    /** S-21: nunca con el token, ni por accidente en un mensaje. */
    @Override
    public String toString() {
        return "ResubmitConfig[tokenSet=" + (token != null) + "]";
    }
}
