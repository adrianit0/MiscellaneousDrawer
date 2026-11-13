package dev.cajonsastre.apps.quality;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** CD-22: ejecución de comandos reales. */
class ProcessRunnerTest {

    final ProcessRunner runner = new ProcessRunner();

    static final class Captured implements CommandRunner.Output {
        final List<String> out = new CopyOnWriteArrayList<>();
        final List<String> err = new CopyOnWriteArrayList<>();

        @Override
        public void out(String line) {
            out.add(line);
        }

        @Override
        public void err(String line) {
            err.add(line);
        }
    }

    @Test
    void cd22_the_launcher_variables_do_not_reach_the_commands_and_the_password_goes_in_the_environment() {
        Map<String, String> env = new HashMap<>(Map.of("PATH", "/usr/bin", "_JPACKAGE_LAUNCHER", "1", "LD_LIBRARY_PATH", "/opt/app/lib"));
        ProcessRunner.environment(env, Command.of("docker").withEnv("MYSQL_PWD", "clave-secreta-de-prueba"));
        assertThat(env).containsOnlyKeys("PATH", "MYSQL_PWD");
        assertThat(env.get("MYSQL_PWD")).isEqualTo("clave-secreta-de-prueba");
    }

    @Test
    void cd22_a_command_that_does_not_exist_says_so() {
        assertThatThrownBy(() -> runner.run(Command.of("cajonsastre-comando-que-no-existe", "x"), new Captured()))
                .isInstanceOf(CommandRunner.CommandNotFound.class)
                .hasMessage("No se encontró el comando «cajonsastre-comando-que-no-existe»");
    }

    @Test
    void cd22_delivers_the_output_line_by_line_and_the_exit_code() throws Exception {
        String javaBin = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        Captured output = new Captured();
        assertThat(runner.run(Command.of(javaBin, "-version"), output)).isZero();
        assertThat(output.err).isNotEmpty();
    }
}
