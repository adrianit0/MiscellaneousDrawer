package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.cajonsastre.platform.ApiError;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-01 a BD-03: la configuración que el usuario escribe a mano. */
class DatabaseConfigTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path dir;

    private ObjectNode body(DatabaseConfig config) {
        ObjectNode node = JSON.valueToTree(config);
        node.remove("rootPassword");
        return node;
    }

    private static void assertInvalid(Runnable call, String field) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiError.class, e -> {
            assertThat(e.status()).isEqualTo(400);
            assertThat(e.body().code()).isEqualTo("invalid_config");
            assertThat(e.body().details()).isEqualTo(Map.of("field", field));
            assertThat(e.getMessage()).startsWith("«" + DatabaseConfig.label(field) + "»");
        });
    }

    @Test
    void bd01_everything_starts_empty_except_the_notice() {
        DatabaseConfig empty = DatabaseConfig.EMPTY;
        assertThat(empty.notifyOnFinish()).isTrue();
        assertThat(empty.missing(List.of("workDir", "s3Path", "rootPassword", "hostPort"))).hasSize(4);
        assertThat(DatabaseConfig.from(JSON.createObjectNode(), empty)).isEqualTo(empty);
    }

    @Test
    void bd01_a_complete_configuration_is_valid_and_can_be_saved_by_halves() throws IOException {
        DatabaseConfig full = Fixtures.config(dir);
        full.validate();
        ObjectNode half = JSON.createObjectNode().put("workDir", "  " + full.workDir() + "  ").put("containerName", " ");
        DatabaseConfig saved = DatabaseConfig.from(half, DatabaseConfig.EMPTY);
        assertThat(saved.workDir()).isEqualTo(full.workDir());
        assertThat(saved.containerName()).as("lo vacío queda sin valor").isNull();
        assertThat(saved.s3Path()).isNull();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "workDir|relativa/carpeta",
            "initSqlFile|inicial.sql",
            "secondInitSqlFile|../segundo.sql",
            "pendingSqlDir|pendientes",
            "versionsSqlDir|versiones",
            "s3Path|https://bucket-de-prueba/volcados",
            "s3Path|s3://bucket-de-prueba/volcados/",
            "s3Path|s3://Bucket_Con_Mayusculas",
            "s3Suffix|_a/b.tar.gz",
            "localSuffix|_a\\b.tar.gz",
            "containerName|-contenedor",
            "containerName|con espacios",
            "mysqlImage|--privileged",
            "mysqlImage|mysql 8",
            "timeZone|Europe/Madrid; rm",
            "databaseName|-demo",
            "databaseName|demo otra",
    })
    void bd01_a_badly_formatted_value_cannot_be_saved_and_names_its_field(String field, String value) throws IOException {
        ObjectNode body = body(Fixtures.config(dir)).put(field, value);
        assertInvalid(() -> DatabaseConfig.from(body, DatabaseConfig.EMPTY), field);
    }

    @Test
    void bd01_ports_and_types_are_checked() throws IOException {
        DatabaseConfig full = Fixtures.config(dir);
        assertInvalid(() -> DatabaseConfig.from(body(full).put("hostPort", 0), full), "hostPort");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("containerPort", 65536), full), "containerPort");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("hostPort", "3306"), full), "hostPort");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("hostPort", 33.5), full), "hostPort");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("workDir", 5), full), "workDir");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("notifyOnFinish", "sí"), full), "notifyOnFinish");
        assertInvalid(() -> DatabaseConfig.from(body(full).put("rootPassword", "con\nsalto"), full), "rootPassword");
        assertThatThrownBy(() -> DatabaseConfig.from(JSON.createArrayNode(), full)).isInstanceOf(ApiError.class)
                .hasMessageContaining("objeto JSON");
    }

    @Test
    void bd02_the_password_is_kept_when_it_does_not_come_replaced_when_it_does_and_cleared_when_empty() throws IOException {
        DatabaseConfig saved = Fixtures.config(dir);
        assertThat(DatabaseConfig.from(body(saved), saved).rootPassword()).isEqualTo(Fixtures.PASSWORD);
        assertThat(DatabaseConfig.from(body(saved).putNull("rootPassword"), saved).rootPassword()).isEqualTo(Fixtures.PASSWORD);
        assertThat(DatabaseConfig.from(body(saved).put("rootPassword", " otra clave "), saved).rootPassword())
                .as("no se recorta").isEqualTo(" otra clave ");
        assertThat(DatabaseConfig.from(body(saved).put("rootPassword", ""), saved).rootPassword()).isNull();
    }

    @Test
    void bd02_the_view_never_carries_the_password() throws IOException {
        DatabaseConfig config = Fixtures.config(dir);
        JsonNode view = JSON.valueToTree(config.view());
        assertThat(view.toString()).doesNotContain(Fixtures.PASSWORD);
        assertThat(view.has("rootPassword")).isFalse();
        assertThat(view.get("rootPasswordSet").asBoolean()).isTrue();
        assertThat(view.get("workDir").asText()).isEqualTo(config.workDir());
        assertThat(view.get("hostPort").asInt()).isEqualTo(3307);
        assertThat(view.get("notifyOnFinish").asBoolean()).isTrue();
        assertThat(JSON.valueToTree(DatabaseConfig.EMPTY.view()).get("rootPasswordSet").asBoolean()).isFalse();
    }

    @Test
    void bd03_says_what_each_step_is_missing() throws IOException {
        JsonNode empty = JSON.valueToTree(DatabaseConfig.EMPTY.view()).get("missing");
        assertThat(empty.get("download")).extracting(JsonNode::asText)
                .containsExactly("workDir", "s3Path", "s3Suffix", "localSuffix");
        assertThat(empty.get("import")).extracting(JsonNode::asText).containsExactly("workDir", "localSuffix", "containerName",
                "mysqlImage", "rootPassword", "hostPort", "containerPort", "timeZone", "initSqlFile", "secondInitSqlFile");
        assertThat(empty.get("scripts")).extracting(JsonNode::asText)
                .containsExactly("containerName", "rootPassword", "databaseName", "pendingSqlDir");
        assertThat(empty.get("dumps")).extracting(JsonNode::asText).containsExactly("workDir", "localSuffix");

        DatabaseConfig full = Fixtures.config(dir);
        JsonNode none = JSON.valueToTree(full.view()).get("missing");
        assertThat(none.get("download")).isEmpty();
        assertThat(none.get("import")).isEmpty();
        assertThat(none.get("scripts")).isEmpty();
        // La carpeta de versiones solo hace falta para ejecutar los scripts de una versión.
        DatabaseConfig noVersions = DatabaseConfig.from(body(full).putNull("versionsSqlDir"), full);
        assertThat(noVersions.missing(DatabaseConfig.SCRIPTS)).isEmpty();
    }

    @Test
    void bd03_requiring_a_step_that_is_not_configured_is_a_409_with_the_missing_fields() {
        assertThatThrownBy(() -> DatabaseConfig.EMPTY.require("download", DatabaseConfig.DOWNLOAD))
                .isInstanceOfSatisfying(ApiError.class, e -> {
                    assertThat(e.status()).isEqualTo(409);
                    assertThat(e.body().code()).isEqualTo("not_configured");
                    assertThat(e.getMessage()).isEqualTo(
                            "Falta configurar: Carpeta de trabajo, Ruta de S3, Sufijo del fichero en S3, Sufijo del fichero local");
                    assertThat(e.body().details()).isEqualTo(
                            Map.of("step", "download", "missing", List.of("workDir", "s3Path", "s3Suffix", "localSuffix")));
                });
    }

    @Test
    void bd01_s20_is_saved_in_a_private_file_and_read_back() throws IOException {
        Path file = dir.resolve("config/apps/database/config.json");
        ConfigStore store = new ConfigStore(file);
        assertThat(store.get()).isEqualTo(DatabaseConfig.EMPTY);
        DatabaseConfig config = Fixtures.config(dir);
        store.save(config);
        assertThat(new ConfigStore(file).get()).isEqualTo(config);
        if (file.getFileSystem().supportedFileAttributeViews().contains("posix")) {
            assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------");
        }
    }

    @Test
    void bd01_a_file_that_cannot_be_read_or_is_not_valid_starts_empty() throws IOException {
        Path file = dir.resolve("config.json");
        Files.writeString(file, "esto no es JSON");
        assertThat(new ConfigStore(file).get()).isEqualTo(DatabaseConfig.EMPTY);
        // Tocado a mano con un valor que el formulario no dejaría guardar.
        Files.writeString(file, "{\"mysqlImage\": \"--privileged\", \"otraClave\": 1}");
        assertThat(new ConfigStore(file).get()).isEqualTo(DatabaseConfig.EMPTY);
        Files.writeString(file, "{\"containerName\": \"mysql-de-prueba\", \"otraClave\": 1}");
        assertThat(new ConfigStore(file).get().containerName()).isEqualTo("mysql-de-prueba");
    }

    @Test
    void bd21_the_bucket_and_the_keys_come_from_the_s3_path() throws IOException {
        DatabaseConfig config = Fixtures.config(dir);
        assertThat(config.bucket()).isEqualTo("bucket-de-prueba");
        assertThat(config.s3DumpName(Branch.HOTFIX)).isEqualTo("BBDD_hotfix_remoto.tar.gz");
        assertThat(config.key(config.s3DumpName(Branch.DEVELOP))).isEqualTo("volcados/BBDD_develop_remoto.tar.gz");
        assertThat(config.s3Url("dynamodb/Dockerfile")).isEqualTo("s3://bucket-de-prueba/volcados/dynamodb/Dockerfile");

        DatabaseConfig noPrefix = DatabaseConfig.from(body(config).put("s3Path", "s3://bucket-de-prueba"), config);
        assertThat(noPrefix.bucket()).isEqualTo("bucket-de-prueba");
        assertThat(noPrefix.key("BBDD_hotfix_remoto.tar.gz")).isEqualTo("BBDD_hotfix_remoto.tar.gz");
        DatabaseConfig deep = DatabaseConfig.from(body(config).put("s3Path", "s3://bucket-de-prueba/a/b"), config);
        assertThat(deep.key("x")).isEqualTo("a/b/x");
    }
}
