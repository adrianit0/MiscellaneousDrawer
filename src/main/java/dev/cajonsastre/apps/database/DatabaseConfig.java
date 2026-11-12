package dev.cajonsastre.apps.database;

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
 * BD-01: lo que el usuario escribe a mano en «Configuración». Un valor null es un campo vacío. Nada de esto tiene valor
 * en el código ni en el repositorio (S-32).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
record DatabaseConfig(String workDir, String s3Path, String s3Suffix, String localSuffix, String containerName,
                      String mysqlImage, String rootPassword, Integer hostPort, Integer containerPort, String timeZone,
                      String initSqlFile, String secondInitSqlFile, String databaseName, String pendingSqlDir,
                      String versionsSqlDir) {

    static final DatabaseConfig EMPTY = new DatabaseConfig(null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null);

    /** BD-03: lo que necesita cada paso. */
    static final List<String> DOWNLOAD = List.of("workDir", "s3Path", "s3Suffix", "localSuffix");
    static final List<String> IMPORT = List.of("workDir", "localSuffix", "containerName", "mysqlImage", "rootPassword",
            "hostPort", "containerPort", "timeZone", "initSqlFile", "secondInitSqlFile");
    static final List<String> SCRIPTS = List.of("containerName", "rootPassword", "databaseName", "pendingSqlDir");
    static final List<String> DUMPS = List.of("workDir", "localSuffix");

    private static final Map<String, String> LABELS = new LinkedHashMap<>();

    static {
        LABELS.put("workDir", "Carpeta de trabajo");
        LABELS.put("s3Path", "Ruta de S3");
        LABELS.put("s3Suffix", "Sufijo del fichero en S3");
        LABELS.put("localSuffix", "Sufijo del fichero local");
        LABELS.put("containerName", "Contenedor");
        LABELS.put("mysqlImage", "Imagen de MySQL");
        LABELS.put("rootPassword", "Contraseña de root");
        LABELS.put("hostPort", "Puerto en la máquina");
        LABELS.put("containerPort", "Puerto del contenedor");
        LABELS.put("timeZone", "Zona horaria");
        LABELS.put("initSqlFile", "Script inicial");
        LABELS.put("secondInitSqlFile", "Segundo script inicial");
        LABELS.put("databaseName", "Base de datos");
        LABELS.put("pendingSqlDir", "Carpeta de scripts pendientes");
        LABELS.put("versionsSqlDir", "Carpeta de versiones");
    }

    private static final String NAME_CHARS = "[^/\\\\\\p{Cntrl}]";
    private static final Pattern S3_PATH = Pattern.compile("s3://[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](/" + NAME_CHARS + "+)*");
    private static final Pattern SUFFIX = Pattern.compile(NAME_CHARS + "{1,100}");
    private static final Pattern CONTAINER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_.-]{0,62}");
    // Empiezan por letra o cifra: nunca se confunden con una opción del comando.
    private static final Pattern IMAGE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,199}");
    private static final Pattern TIME_ZONE = Pattern.compile("[A-Za-z0-9_+/-]{1,64}");
    private static final Pattern DATABASE = Pattern.compile("[A-Za-z0-9_$][A-Za-z0-9_$-]{0,63}");
    private static final Pattern PASSWORD = Pattern.compile("\\P{Cntrl}{1,200}");

    static String label(String key) {
        return LABELS.getOrDefault(key, key);
    }

    /**
     * BD-01, BD-02: la configuración que resulta de guardar body. Un campo que no viene queda vacío, salvo la
     * contraseña: si no viene o es null se conserva la guardada, y la cadena vacía la borra.
     */
    static DatabaseConfig from(JsonNode body, DatabaseConfig saved) {
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
        DatabaseConfig config = new DatabaseConfig(text(body, "workDir"), text(body, "s3Path"), text(body, "s3Suffix"),
                text(body, "localSuffix"), text(body, "containerName"), text(body, "mysqlImage"), password,
                port(body, "hostPort"), port(body, "containerPort"), text(body, "timeZone"), text(body, "initSqlFile"),
                text(body, "secondInitSqlFile"), text(body, "databaseName"), text(body, "pendingSqlDir"),
                text(body, "versionsSqlDir"));
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

    private static Integer port(JsonNode body, String key) {
        JsonNode n = body.get(key);
        if (n == null || n.isNull()) {
            return null;
        }
        if (!n.isIntegralNumber() || !n.canConvertToInt()) {
            throw invalid(key, "debe ser un número entre 1 y 65535");
        }
        return n.asInt();
    }

    /** BD-01: el formato de cada valor escrito. Lo vacío no se comprueba: se puede guardar a medias. */
    void validate() {
        for (String key : List.of("workDir", "initSqlFile", "secondInitSqlFile", "pendingSqlDir", "versionsSqlDir")) {
            String value = (String) value(key);
            if (value != null && !absolute(value)) {
                throw invalid(key, "debe ser una ruta absoluta");
            }
        }
        check("s3Path", s3Path, S3_PATH, "debe ser s3://<bucket> o s3://<bucket>/<prefijo>, sin / final");
        check("s3Suffix", s3Suffix, SUFFIX, "debe tener de 1 a 100 caracteres, sin barras");
        check("localSuffix", localSuffix, SUFFIX, "debe tener de 1 a 100 caracteres, sin barras");
        check("containerName", containerName, CONTAINER,
                "solo admite letras, cifras, _ . y -, empieza por letra o cifra y tiene hasta 63 caracteres");
        check("mysqlImage", mysqlImage, IMAGE,
                "solo admite letras, cifras y _ . : / @ -, empieza por letra o cifra y tiene hasta 200 caracteres");
        check("rootPassword", rootPassword, PASSWORD, "debe tener de 1 a 200 caracteres");
        check("timeZone", timeZone, TIME_ZONE, "solo admite letras, cifras y _ + / -, hasta 64 caracteres");
        check("databaseName", databaseName, DATABASE,
                "solo admite letras, cifras y _ $ -, no empieza por - y tiene hasta 64 caracteres");
        for (String key : List.of("hostPort", "containerPort")) {
            Integer value = (Integer) value(key);
            if (value != null && (value < 1 || value > 65535)) {
                throw invalid(key, "debe ser un número entre 1 y 65535");
            }
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

    Object value(String key) {
        return switch (key) {
            case "workDir" -> workDir;
            case "s3Path" -> s3Path;
            case "s3Suffix" -> s3Suffix;
            case "localSuffix" -> localSuffix;
            case "containerName" -> containerName;
            case "mysqlImage" -> mysqlImage;
            case "rootPassword" -> rootPassword;
            case "hostPort" -> hostPort;
            case "containerPort" -> containerPort;
            case "timeZone" -> timeZone;
            case "initSqlFile" -> initSqlFile;
            case "secondInitSqlFile" -> secondInitSqlFile;
            case "databaseName" -> databaseName;
            case "pendingSqlDir" -> pendingSqlDir;
            case "versionsSqlDir" -> versionsSqlDir;
            default -> throw new IllegalArgumentException("Campo desconocido: " + key);
        };
    }

    /** BD-03: los campos de keys que siguen vacíos. */
    List<String> missing(List<String> keys) {
        return keys.stream().filter(k -> value(k) == null).toList();
    }

    /** BD-03: 409 si falta algo de lo que necesita un paso. */
    void require(String step, List<String> keys) {
        List<String> missing = missing(keys);
        if (!missing.isEmpty()) {
            throw new ApiError(409, "not_configured",
                    "Falta configurar: " + String.join(", ", missing.stream().map(DatabaseConfig::label).toList()),
                    Map.of("step", step, "missing", missing));
        }
    }

    /** BD-02: lo que sale del servidor: todo menos la contraseña, y lo que falta por paso (BD-03). */
    Map<String, Object> view() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String key : LABELS.keySet()) {
            if (!key.equals("rootPassword")) {
                out.put(key, value(key));
            }
        }
        out.put("rootPasswordSet", rootPassword != null);
        Map<String, List<String>> missing = new LinkedHashMap<>();
        missing.put("download", missing(DOWNLOAD));
        missing.put("import", missing(IMPORT));
        missing.put("scripts", missing(SCRIPTS));
        missing.put("dumps", missing(DUMPS));
        out.put("missing", missing);
        return out;
    }

    // --- S3 (BD-21) ---

    String bucket() {
        String rest = s3Path.substring("s3://".length());
        int slash = rest.indexOf('/');
        return slash < 0 ? rest : rest.substring(0, slash);
    }

    /** La clave de un objeto bajo el prefijo de s3Path. */
    String key(String name) {
        String rest = s3Path.substring("s3://".length());
        int slash = rest.indexOf('/');
        return slash < 0 ? name : rest.substring(slash + 1) + "/" + name;
    }

    String s3Url(String name) {
        return s3Path + "/" + name;
    }

    /** BD-21 */
    String s3DumpName(Branch branch) {
        return DumpLibrary.PREFIX + branch.id() + s3Suffix;
    }
}
