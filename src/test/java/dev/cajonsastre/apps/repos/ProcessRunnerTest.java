package dev.cajonsastre.apps.repos;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** RG-21: ejecución de comandos reales. */
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
    void rg21_git_cannot_ask_for_a_password_and_the_launcher_variables_do_not_reach_it() {
        Map<String, String> env = new HashMap<>(Map.of("PATH", "/usr/bin", "_JPACKAGE_LAUNCHER", "1", "LD_LIBRARY_PATH", "/opt/app/lib"));
        ProcessRunner.environment(env, Command.git("fetch"));
        assertThat(env).containsOnlyKeys("PATH", "GIT_TERMINAL_PROMPT", "GIT_SSH_COMMAND");
        assertThat(env).containsEntry("GIT_TERMINAL_PROMPT", "0").containsEntry("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");
    }

    @Test
    void rg21_the_ssh_command_of_the_user_is_kept() {
        Map<String, String> env = new HashMap<>(Map.of("GIT_SSH_COMMAND", "ssh -i /ruta/clave", "GIT_TERMINAL_PROMPT", "1"));
        ProcessRunner.environment(env, Command.gitIn("/tmp/x", "fetch"));
        assertThat(env).containsEntry("GIT_SSH_COMMAND", "ssh -i /ruta/clave").containsEntry("GIT_TERMINAL_PROMPT", "0");
    }

    @Test
    void rg28_a_command_is_written_as_in_a_terminal() {
        assertThat(Command.gitIn("/tmp/con espacio", "switch", "develop").line()).isEqualTo("$ git -C \"/tmp/con espacio\" switch develop");
    }

    @Test
    void rg21_a_command_that_does_not_exist_says_so() {
        Command command = new Command(List.of("cajonsastre-comando-que-no-existe", "x"), Map.of(), Map.of());
        assertThatThrownBy(() -> runner.run(command, new Captured())).isInstanceOf(CommandRunner.CommandNotFound.class)
                .hasMessage("No se encontró el comando «cajonsastre-comando-que-no-existe»");
    }

    @Test
    void rg21_delivers_the_output_line_by_line_and_the_exit_code() throws Exception {
        String javaBin = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        Captured output = new Captured();
        assertThat(runner.run(new Command(List.of(javaBin, "-version"), Map.of(), Map.of()), output)).isZero();
        assertThat(output.err).isNotEmpty();
    }
}
