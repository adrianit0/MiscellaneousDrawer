package dev.cajonsastre.apps.repos;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.platform.ApiError;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Pattern;

/** RG-01: un repositorio de la lista: dónde está su copia local, cuál es su remoto y cuál su rama por defecto. */
@JsonIgnoreProperties(ignoreUnknown = true)
record Repo(int id, String name, String dir, String remoteUrl, String defaultBranch) {

    static final int MAX_NAME = 60;
    static final int MAX_DIR = 500;
    static final int MAX_URL = 300;
    static final int MAX_BRANCH = 100;
    static final String DEFAULT_BRANCH = "develop";

    private static final Map<String, String> LABELS = Map.of(
            "name", "Nombre",
            "dir", "Carpeta",
            "remoteUrl", "URL del remoto",
            "defaultBranch", "Rama por defecto");
    /** RG-06 */
    private static final Pattern BRANCH = Pattern.compile("[A-Za-z0-9_][A-Za-z0-9._/-]*");
    /** RG-02: https://servidor/ruta o ssh://servidor/ruta, con usuario opcional. */
    private static final Pattern URL = Pattern.compile("(?:https|ssh)://(?:([^/@\\s]*)@)?[A-Za-z0-9.-]+(?::\\d{1,5})?/\\S+");
    /** RG-02: usuario@servidor:ruta. */
    private static final Pattern SCP = Pattern.compile("[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\\s:]\\S*");

    /** RG-02: el repositorio que resulta de guardar body con ese identificador. */
    static Repo from(JsonNode body, int id) {
        if (body == null || !body.isObject()) {
            throw new ApiError(400, "invalid_repo", "El repositorio debe ser un objeto JSON");
        }
        String branch = text(body, "defaultBranch");
        Repo repo = new Repo(id, text(body, "name"), text(body, "dir"), text(body, "remoteUrl"),
                branch == null ? DEFAULT_BRANCH : branch);
        repo.validate();
        return repo;
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

    /** RG-02. También pasa por aquí un fichero tocado a mano (RG-01). */
    void validate() {
        if (name == null || name.isBlank() || name.length() > MAX_NAME || !name.equals(name.strip())) {
            throw invalid("name", "debe tener de 1 a " + MAX_NAME + " caracteres");
        }
        if (dir == null || dir.length() > MAX_DIR || dir.chars().anyMatch(Character::isISOControl) || !absolute(dir)) {
            throw invalid("dir", "debe ser una ruta absoluta de hasta " + MAX_DIR + " caracteres");
        }
        if (remoteUrl == null || remoteUrl.length() > MAX_URL) {
            throw invalid("remoteUrl", "debe tener de 1 a " + MAX_URL + " caracteres");
        }
        var url = URL.matcher(remoteUrl);
        if (url.matches()) {
            // RG-05
            if (url.group(1) != null && url.group(1).contains(":")) {
                throw invalid("remoteUrl", "no debe llevar contraseña: git usa las credenciales que ya tenga configuradas");
            }
        } else if (!SCP.matcher(remoteUrl).matches()) {
            throw invalid("remoteUrl", "debe ser como https://servidor/ruta, ssh://servidor/ruta o usuario@servidor:ruta");
        }
        if (!validBranch(defaultBranch)) {
            throw invalid("defaultBranch", "no es un nombre de rama válido");
        }
    }

    private static boolean absolute(String dir) {
        try {
            return Path.of(dir).isAbsolute();
        } catch (InvalidPathException e) {
            return false;
        }
    }

    /** RG-06: un nombre que git no puede leer como una opción. */
    static boolean validBranch(String branch) {
        return branch != null && branch.length() <= MAX_BRANCH && BRANCH.matcher(branch).matches() && !branch.endsWith("/")
                && !branch.endsWith(".lock") && !branch.contains("..") && !branch.contains("//");
    }

    private static ApiError invalid(String key, String rule) {
        return new ApiError(400, "invalid_repo", "«" + LABELS.get(key) + "» " + rule, Map.of("field", key));
    }
}
