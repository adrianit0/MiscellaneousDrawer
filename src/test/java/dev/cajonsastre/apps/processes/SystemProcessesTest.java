package dev.cajonsastre.apps.processes;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CP-11, CP-12, CP-22: los procesos reales. Solo mira, y el único proceso que cierra es uno que lanza la propia prueba
 * (ADR-0018).
 */
class SystemProcessesTest {

    final SystemProcesses system = new SystemProcesses();

    /** El proceso que la prueba lanza para cerrarlo. */
    public static final class Sleep {
        public static void main(String[] args) throws InterruptedException {
            Thread.sleep(60_000);
        }
    }

    @Test
    void cp11_lists_the_processes_with_their_command_line_including_this_one() {
        long self = ProcessHandle.current().pid();
        assertThat(system.self()).isEqualTo(self);
        assertThat(system.processes()).filteredOn(p -> p.pid() == self).singleElement()
                .satisfies(p -> assertThat(p.command()).containsIgnoringCase("java"));
    }

    @Test
    void cp12_ss_is_asked_for_listening_tcp_sockets_with_their_process_and_without_the_launcher_variables() {
        assertThat(SystemProcesses.SS).containsExactly("ss", "-H", "-l", "-t", "-n", "-p");
        Map<String, String> env = new HashMap<>(Map.of("PATH", "/usr/bin", "_JPACKAGE_LAUNCHER", "1", "LD_LIBRARY_PATH", "/opt/app/lib"));
        SystemProcesses.environment(env);
        assertThat(env).containsOnlyKeys("PATH");
    }

    @Test
    void cp12_cp15_reads_the_output_of_ss() {
        List<ProcessTable.Listener> listeners = SystemProcesses.parse(List.of(
                "LISTEN 0      4096               *:8080             *:*    users:((\"java\",pid=12345,fd=123))",
                "LISTEN 0      100        127.0.0.1:8081       0.0.0.0:*    users:((\"java\",pid=222,fd=9))  ",
                "LISTEN 0      511             [::]:3000          [::]:*    users:((\"node\",pid=31,fd=20),(\"node\",pid=32,fd=20))",
                "LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*",
                "LISTEN 0      128   [::ffff:127.0.0.1]:8082         *:*    users:((\"Web Content\",pid=77,fd=4))",
                "LISTEN 0      4096         0.0.0.0:3306       0.0.0.0:*",
                "",
                "una línea que no es de ss",
                "LISTEN 0 5 *:http *:*"));
        assertThat(listeners).containsExactly(
                new ProcessTable.Listener(8080, List.of(12345L)),
                new ProcessTable.Listener(8081, List.of(222L)),
                new ProcessTable.Listener(3000, List.of(31L, 32L)),
                new ProcessTable.Listener(53, List.of()),
                new ProcessTable.Listener(8082, List.of(77L)),
                new ProcessTable.Listener(3306, List.of()));
    }

    @Test
    void cp22_kills_a_process_started_by_this_test_and_waits_for_it() throws Exception {
        String javaBin = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        Process child = new ProcessBuilder(javaBin, "-cp", System.getProperty("java.class.path"), Sleep.class.getName())
                .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
        try {
            assertThat(child.isAlive()).isTrue();
            assertThat(system.kill(child.pid())).isTrue();
            assertThat(child.isAlive()).isFalse();
            // Uno que ya no existe está cerrado.
            assertThat(system.kill(child.pid())).isTrue();
        } finally {
            child.destroyForcibly();
        }
    }
}
