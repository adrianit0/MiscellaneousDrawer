package dev.cajonsastre.apps.database;

import dev.cajonsastre.apps.database.SqlScripts.Result;
import dev.cajonsastre.platform.ApiError;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-50 a BD-54: las carpetas de scripts y su ejecución, con un docker simulado. */
class SqlScriptsTest {

    @TempDir
    Path dir;
    final FakeCommands docker = new FakeCommands();
    final Fixtures.Recorder reporter = new Fixtures.Recorder();
    DatabaseConfig config;
    SqlScripts scripts;
    Path pending;
    Path versions;

    @BeforeEach
    void setUp() throws IOException {
        config = Fixtures.config(dir);
        scripts = new SqlScripts(config);
        pending = Path.of(config.pendingSqlDir());
        versions = Path.of(config.versionsSqlDir());
        Files.writeString(pending.resolve("TAREA-20.sql"), "UPDATE b;");
        Files.writeString(pending.resolve("TAREA-100.sql"), "UPDATE a;");
        Files.writeString(pending.resolve("con espacios.sql"), "UPDATE c;");
        Files.writeString(pending.resolve("LEEME.txt"), "no es un script");
        Files.createDirectories(pending.resolve("carpeta.sql"));
        for (String version : List.of("1.9.0", "1.10.0", "1.2.3", "2.0.0")) {
            Files.createDirectories(versions.resolve(version));
        }
        Files.writeString(versions.resolve("1.10.0/TAREA-7.sql"), "INSERT x;");
        Files.writeString(versions.resolve("no-es-una-carpeta"), "x");
    }

    private static void assertInvalid(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiError.class, e -> {
            assertThat(e.status()).isEqualTo(400);
            assertThat(e.body().code()).isEqualTo("invalid_request");
        });
    }

    private List<Result> run(Path folder, List<String> files) throws Exception {
        Result[] results = new Result[files.size()];
        int failed = scripts.run(docker, reporter, folder, files, (i, r) -> results[i] = r);
        assertThat(failed).isEqualTo(Arrays.stream(results).filter(r -> r.state().equals("error")).count());
        return new ArrayList<>(Arrays.asList(results));
    }

    @Test
    void bd50_lists_the_versions_from_highest_to_lowest_comparing_their_numbers() throws IOException {
        assertThat(scripts.versions()).containsExactly("2.0.0", "1.10.0", "1.9.0", "1.2.3");
        assertThat(SqlScripts.compareVersions("12.6.9", "12.6.10")).isNegative();
        assertThat(SqlScripts.compareVersions("12.6.10", "12.6.10")).isZero();
        assertThat(SqlScripts.compareVersions("12.7", "12.6.10")).isPositive();
        assertThat(SqlScripts.compareVersions("12.6", "12.6.1")).isNegative();
        assertThat(SqlScripts.compareVersions("v2", "v10")).isNegative();
    }

    @Test
    void bd50_lists_the_sql_files_of_a_folder_by_name() throws IOException {
        SqlScripts.Listing listing = scripts.listing(null);
        assertThat(listing.version()).isNull();
        assertThat(listing.folder()).isEqualTo(pending.toString());
        assertThat(listing.exists()).isTrue();
        assertThat(listing.files()).containsExactly("TAREA-100.sql", "TAREA-20.sql", "con espacios.sql");
        assertThat(listing.versions()).hasSize(4);

        SqlScripts.Listing version = scripts.listing("1.10.0");
        assertThat(version.version()).isEqualTo("1.10.0");
        assertThat(version.files()).containsExactly("TAREA-7.sql");
        assertThat(scripts.listing("2.0.0").files()).isEmpty();
    }

    @Test
    void bd50_bd54_a_pending_folder_that_does_not_exist_is_listed_as_such() throws IOException {
        Files.walk(pending).sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        SqlScripts.Listing listing = scripts.listing(null);
        assertThat(listing.exists()).isFalse();
        assertThat(listing.files()).isEmpty();
    }

    @Test
    void bd50_without_a_versions_folder_there_are_no_versions() throws IOException {
        DatabaseConfig noVersions = new DatabaseConfig(config.workDir(), null, null, config.localSuffix(), config.containerName(),
                null, config.rootPassword(), null, null, null, null, null, config.databaseName(), config.pendingSqlDir(), null, true);
        SqlScripts sql = new SqlScripts(noVersions);
        assertThat(sql.versions()).isEmpty();
        assertThatThrownBy(() -> sql.folder("1.10.0")).isInstanceOfSatisfying(ApiError.class,
                e -> assertThat(e.body().code()).isEqualTo("not_configured"));
    }

    @Test
    void bd51_runs_every_script_in_name_order_against_the_database() throws Exception {
        List<Result> results = run(pending, scripts.select(pending, null));
        assertThat(results).containsExactly(new Result("TAREA-100.sql", "ok", null), new Result("TAREA-20.sql", "ok", null),
                new Result("con espacios.sql", "ok", null));
        assertThat(docker.executedSql).containsExactly("demo: UPDATE a;", "demo: UPDATE b;", "demo: UPDATE c;");
        Command first = docker.commands.get(0);
        assertThat(first.args()).containsExactly("docker", "exec", "-i", "-e", "MYSQL_PWD", "mysql-de-prueba", "mysql",
                "--default-character-set=utf8", "-uroot", "demo");
        assertThat(first.stdin()).isEqualTo(pending.resolve("TAREA-100.sql"));
        // BD-16
        assertThat(first.env()).isEqualTo(Map.of("MYSQL_PWD", Fixtures.PASSWORD));
        assertThat(String.join("\n", reporter.log)).doesNotContain(Fixtures.PASSWORD);
    }

    @Test
    void bd51_runs_only_the_chosen_ones_always_in_name_order() throws Exception {
        List<String> chosen = scripts.select(pending, List.of("con espacios.sql", "TAREA-100.sql"));
        assertThat(chosen).containsExactly("TAREA-100.sql", "con espacios.sql");
        run(pending, chosen);
        assertThat(docker.executedSql).containsExactly("demo: UPDATE a;", "demo: UPDATE c;");
        assertThat(scripts.select(pending, List.of())).isEmpty();
    }

    @Test
    void bd51_runs_the_scripts_of_a_version() throws Exception {
        Path folder = scripts.folder("1.10.0");
        assertThat(folder).isEqualTo(versions.resolve("1.10.0"));
        run(folder, scripts.select(folder, List.of("TAREA-7.sql")));
        assertThat(docker.executedSql).containsExactly("demo: INSERT x;");
    }

    @Test
    void bd52_a_script_that_fails_does_not_stop_the_rest_and_keeps_its_error() throws Exception {
        Files.writeString(pending.resolve("TAREA-20.sql"), "FALLA;");
        List<Result> results = run(pending, scripts.select(pending, null));
        assertThat(results).extracting(Result::state).containsExactly("ok", "error", "ok");
        assertThat(results.get(1).error()).isEqualTo("ERROR 1064 (42000) at line 1: You have an error in your SQL syntax");
        assertThat(docker.executedSql).hasSize(3);
        assertThat(reporter.log).contains("ERROR al ejecutar TAREA-20.sql; se sigue con el siguiente");
    }

    @Test
    void bd52_each_script_goes_through_running_before_its_result() throws Exception {
        List<String> seen = new ArrayList<>();
        scripts.run(docker, reporter, pending, List.of("TAREA-100.sql", "TAREA-20.sql"), (i, r) -> seen.add(i + ":" + r.state()));
        assertThat(seen).containsExactly("0:running", "0:ok", "1:running", "1:ok");
        assertThat(reporter.messages).containsExactly("Script 1 de 2: TAREA-100.sql", "Script 2 de 2: TAREA-20.sql");
    }

    @ParameterizedTest
    @ValueSource(strings = {"../pendientes", "..", ".", "1.10.0/..", "a/b", "a\\b", "", " ", "no-existe", "no-es-una-carpeta"})
    void bd53_a_version_must_be_a_direct_subfolder(String version) {
        assertInvalid(() -> scripts.folder(version));
    }

    @ParameterizedTest
    @ValueSource(strings = {"../inicial.sql", "..", "sub/x.sql", "a\\b.sql", "", "no-existe.sql", "LEEME.txt", "carpeta.sql"})
    void bd53_a_file_must_be_a_script_of_the_folder(String file) {
        assertInvalid(() -> {
            try {
                scripts.select(pending, List.of("TAREA-20.sql", file));
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(docker.commands).isEmpty();
    }
}
