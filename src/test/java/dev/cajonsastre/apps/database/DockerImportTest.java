package dev.cajonsastre.apps.database;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-16, BD-40, BD-41: la importación, con un docker simulado. */
class DockerImportTest {

    @TempDir
    Path dir;
    final FakeCommands docker = new FakeCommands();
    final Fixtures.Recorder reporter = new Fixtures.Recorder();
    final Fixtures.NoSleep sleeper = new Fixtures.NoSleep();
    DatabaseConfig config;
    Path dump;

    @BeforeEach
    void setUp() throws IOException {
        config = Fixtures.config(dir);
        dump = Fixtures.write(Path.of(config.workDir()).resolve("BBDD_hotfix_local.tar.gz"), "volcado", Fixtures.MONDAY);
    }

    private void run() throws Exception {
        new DockerImport(docker, config, reporter, sleeper).run(dump);
    }

    @Test
    void bd41_runs_the_usual_sequence_in_order() throws Exception {
        run();
        assertThat(docker.commands).extracting(Command::args).containsExactly(
                List.of("docker", "stop", "mysql-de-prueba"),
                List.of("docker", "rm", "mysql-de-prueba"),
                List.of("docker", "volume", "rm", "mysql-de-prueba-data"),
                List.of("docker", "volume", "create", "mysql-de-prueba-data"),
                List.of("docker", "run", "-d", "-p", "3307:3306", "--name", "mysql-de-prueba", "--restart", "always", "-e",
                        "MYSQL_ROOT_PASSWORD", "-e", "TZ=Europe/Madrid", "--mount", "src=mysql-de-prueba-data,dst=/var/lib/mysql",
                        "mysql:8.4", "--lower-case-table-names=1", "--sql_mode=NO_ENGINE_SUBSTITUTION"),
                List.of("docker", "stop", "mysql-de-prueba"),
                List.of("docker", "run", "--rm", "--volumes-from", "mysql-de-prueba", "-v",
                        dump.toAbsolutePath() + ":/dump.tar.gz:ro", "ubuntu", "bash", "-c",
                        "cd /var/lib/mysql && tar xzvf /dump.tar.gz --strip 3"),
                List.of("docker", "start", "mysql-de-prueba"),
                List.of("docker", "exec", "-i", "-e", "MYSQL_PWD", "mysql-de-prueba", "mysql", "--default-character-set=utf8", "-uroot"),
                List.of("docker", "exec", "-i", "-e", "MYSQL_PWD", "mysql-de-prueba", "mysql", "--default-character-set=utf8", "-uroot"));
        // Los dos scripts iniciales, en su orden, por la entrada estándar y sin elegir base.
        assertThat(docker.commands.get(8).stdin()).isEqualTo(Path.of(config.initSqlFile()));
        assertThat(docker.commands.get(9).stdin()).isEqualTo(Path.of(config.secondInitSqlFile()));
        assertThat(docker.executedSql).containsExactly("-: CREATE USER demo;", "-: RENAME demo;");
    }

    @Test
    void bd41_waits_twenty_seconds_after_each_start_of_mysql() throws Exception {
        run();
        assertThat(sleeper.sleeps).containsExactly(DockerImport.START_WAIT, DockerImport.START_WAIT);
        assertThat(DockerImport.START_WAIT.toSeconds()).isEqualTo(20);
        // Una tras crear el contenedor y otra tras volver a arrancarlo.
        List<String> log = reporter.log;
        int created = indexOf(log, "$ docker run -d");
        int stopped = lastIndexOf(log, "$ docker stop");
        int started = indexOf(log, "$ docker start");
        int firstWait = log.indexOf("Espera de 20 s");
        int secondWait = log.lastIndexOf("Espera de 20 s");
        assertThat(firstWait).isBetween(created, stopped);
        assertThat(secondWait).isGreaterThan(started);
    }

    private static int indexOf(List<String> log, String prefix) {
        for (int i = 0; i < log.size(); i++) {
            if (log.get(i).startsWith(prefix)) {
                return i;
            }
        }
        return -1;
    }

    private static int lastIndexOf(List<String> log, String prefix) {
        for (int i = log.size() - 1; i >= 0; i--) {
            if (log.get(i).startsWith(prefix)) {
                return i;
            }
        }
        return -1;
    }

    @Test
    void bd16_the_password_goes_in_the_environment_and_never_in_a_command_or_in_the_log() throws Exception {
        run();
        assertThat(docker.commands).allSatisfy(c -> {
            assertThat(String.join(" ", c.args())).doesNotContain(Fixtures.PASSWORD);
            assertThat(c.line()).doesNotContain(Fixtures.PASSWORD);
        });
        assertThat(String.join("\n", reporter.log)).doesNotContain(Fixtures.PASSWORD);
        assertThat(String.join("\n", reporter.messages)).doesNotContain(Fixtures.PASSWORD);
        // Solo la reciben el contenedor al crearse y el cliente mysql.
        assertThat(docker.commands.get(4).env()).isEqualTo(Map.of("MYSQL_ROOT_PASSWORD", Fixtures.PASSWORD));
        assertThat(docker.commands.get(8).env()).isEqualTo(Map.of("MYSQL_PWD", Fixtures.PASSWORD));
        assertThat(docker.commands.get(9).env()).isEqualTo(Map.of("MYSQL_PWD", Fixtures.PASSWORD));
        assertThat(docker.commands.stream().filter(c -> !c.env().isEmpty())).hasSize(3);
    }

    @Test
    void bd41_the_first_cleanup_may_fail_because_nothing_exists_yet() throws Exception {
        docker.failing = c -> c.args().subList(1, c.args().size()).equals(List.of("rm", "mysql-de-prueba"))
                || c.args().contains("volume") && c.args().contains("rm")
                || docker.commands.size() == 1;
        run();
        assertThat(docker.commands).hasSize(10);
        assertThat(reporter.messages).last().isEqualTo("Importación terminada");
    }

    @Test
    void bd41_a_failure_after_the_cleanup_stops_the_import() {
        docker.failing = c -> c.args().contains("--volumes-from");
        assertThatThrownBy(this::run).isInstanceOf(StepFailed.class).hasMessage("No se pudo extraer el volcado (código 1)");
        assertThat(docker.commands).as("ni se arranca ni se ejecutan los scripts").hasSize(7);
        assertThat(docker.executedSql).isEmpty();

        docker.commands.clear();
        docker.failing = c -> c.stdin() != null && c.stdin().equals(Path.of(config.initSqlFile()));
        assertThatThrownBy(this::run).isInstanceOf(StepFailed.class).hasMessage("No se pudo ejecutar inicial.sql (código 1)");
        assertThat(docker.commands).as("el segundo script no se ejecuta").hasSize(9);
    }

    @Test
    void bd40_a_dump_that_does_not_exist_fails_without_touching_docker() {
        dump = dump.resolveSibling("auto-20261102-080000.tar.gz");
        assertThatThrownBy(this::run).isInstanceOf(StepFailed.class).hasMessage("El volcado auto-20261102-080000.tar.gz no existe");
        assertThat(docker.commands).isEmpty();
    }

    @Test
    void bd41_a_missing_initial_script_fails_before_deleting_the_container() throws IOException {
        Files.delete(Path.of(config.secondInitSqlFile()));
        assertThatThrownBy(this::run).isInstanceOf(StepFailed.class).hasMessageContaining("segundo.sql no existe");
        assertThat(docker.commands).isEmpty();
    }

    @Test
    void bd19_without_the_docker_command_it_says_so() {
        docker.missing.add("docker");
        assertThatThrownBy(this::run).isInstanceOf(CommandRunner.CommandNotFound.class).hasMessage("No se encontró el comando «docker»");
    }
}
