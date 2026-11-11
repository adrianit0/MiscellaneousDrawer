package dev.cajonsastre.apps.database;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-15, BD-16, BD-19: ejecución de comandos reales, con el java de las pruebas como comando. */
class ProcessRunnerTest {

    @TempDir
    Path dir;
    final ProcessRunner runner = new ProcessRunner();

    /** Las tres salidas de un comando, por separado. */
    static final class Captured implements CommandRunner.Output {
        final List<String> out = new CopyOnWriteArrayList<>();
        final List<String> err = new CopyOnWriteArrayList<>();
        final List<String> progress = new CopyOnWriteArrayList<>();
        final CountDownLatch firstLine = new CountDownLatch(1);

        @Override
        public void out(String line) {
            out.add(line);
            firstLine.countDown();
        }

        @Override
        public void err(String line) {
            err.add(line);
        }

        @Override
        public void progress(String text) {
            progress.add(text);
        }
    }

    private static Command probe(String... args) {
        try {
            String classes = Path.of(CommandProbe.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString();
            List<String> command = new ArrayList<>(List.of(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                    "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-cp", classes,
                    CommandProbe.class.getName()));
            command.addAll(List.of(args));
            return Command.of(command);
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void bd14_delivers_the_output_line_by_line_and_the_exit_code() throws Exception {
        Path input = dir.resolve("entrada.sql");
        Files.writeString(input, "SELECT 1;\nSELECT 'ñ';\n", StandardCharsets.UTF_8);
        Captured output = new Captured();
        assertThat(runner.run(probe("echo").withStdin(input), output)).isZero();
        assertThat(output.out).containsExactly("> SELECT 1;", "> SELECT 'ñ';");
        assertThat(output.err).containsExactly("2 líneas");

        assertThat(runner.run(probe("exit", "3"), new Captured())).isEqualTo(3);
    }

    @Test
    void bd14_without_an_input_file_the_command_sees_an_empty_input() throws Exception {
        Captured output = new Captured();
        assertThat(runner.run(probe("echo"), output)).isZero();
        assertThat(output.err).containsExactly("0 líneas");
    }

    @Test
    void bd16_secrets_travel_in_the_environment_and_not_in_the_command_line() throws Exception {
        Captured output = new Captured();
        Command command = probe("env", "MYSQL_PWD").withEnv("MYSQL_PWD", "clave-secreta-de-prueba");
        assertThat(runner.run(command, output)).isZero();
        assertThat(output.out).containsExactly("MYSQL_PWD=clave-secreta-de-prueba");
        assertThat(command.line()).doesNotContain("clave-secreta-de-prueba");
        assertThat(String.join(" ", command.args())).doesNotContain("clave-secreta-de-prueba");
    }

    @Test
    void bd19_the_launcher_variables_do_not_reach_the_commands() {
        Map<String, String> env = new HashMap<>(Map.of("PATH", "/usr/bin", "_JPACKAGE_LAUNCHER", "1", "LD_LIBRARY_PATH", "/opt/app/lib",
                "HOME", "/home/demo"));
        ProcessRunner.environment(env, Command.of("aws").withEnv("MYSQL_PWD", "x"));
        assertThat(env).containsOnlyKeys("PATH", "HOME", "MYSQL_PWD");
    }

    @Test
    void bd19_a_command_that_does_not_exist_says_so() {
        assertThatThrownBy(() -> runner.run(Command.of("cajonsastre-comando-que-no-existe", "x"), new Captured()))
                .isInstanceOf(CommandRunner.CommandNotFound.class)
                .hasMessage("No se encontró el comando «cajonsastre-comando-que-no-existe»");
    }

    @Test
    void bd27_a_line_the_command_overwrites_is_progress_and_not_a_line() throws Exception {
        Captured output = new Captured();
        assertThat(runner.run(probe("progress"), output)).isZero();
        assertThat(output.progress).containsExactly("10 %", "50 %");
        assertThat(output.out).containsExactly("hecho", "última");
    }

    @Test
    void bd27_splits_lines_with_any_ending() throws IOException {
        List<String> lines = new ArrayList<>();
        List<String> progress = new ArrayList<>();
        ProcessRunner.split(new BufferedReader(new StringReader("uno\ndos\r\n\ntres\rcuatro\r\rcinco")), lines::add, progress::add);
        assertThat(lines).containsExactly("uno", "dos", "", "cinco");
        assertThat(progress).containsExactly("tres", "cuatro");

        lines.clear();
        progress.clear();
        ProcessRunner.split(new BufferedReader(new StringReader("fin\r")), lines::add, progress::add);
        assertThat(lines).isEmpty();
        assertThat(progress).containsExactly("fin");
    }

    @Test
    void bd15_interrupting_the_thread_ends_the_command() throws Exception {
        Captured output = new Captured();
        AtomicReference<Throwable> ended = new AtomicReference<>();
        Thread thread = new Thread(() -> {
            try {
                runner.run(probe("sleep"), output);
                ended.set(new AssertionError("terminó sin interrumpirse"));
            } catch (InterruptedException | IOException e) {
                ended.set(e);
            }
        });
        thread.start();
        assertThat(output.firstLine.await(30, TimeUnit.SECONDS)).as("el comando arrancó").isTrue();
        long children = ProcessHandle.current().children().filter(ProcessHandle::isAlive).count();
        assertThat(children).isPositive();

        thread.interrupt();
        thread.join(20_000);
        assertThat(thread.isAlive()).isFalse();
        assertThat(ended.get()).isInstanceOf(InterruptedException.class);
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (ProcessHandle.current().children().anyMatch(ProcessHandle::isAlive) && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertThat(ProcessHandle.current().children().filter(ProcessHandle::isAlive).count()).isLessThan(children);
    }

    @Test
    void bd14_the_command_line_for_the_log_quotes_what_has_spaces() {
        Command command = Command.of("docker", "run", "bash", "-c", "cd /var/lib/mysql && tar xzvf x").withStdin(Path.of("a.sql"));
        assertThat(command.line()).isEqualTo("$ docker run bash -c \"cd /var/lib/mysql && tar xzvf x\" < a.sql");
        assertThat(Command.of("aws", "s3", "cp").line()).isEqualTo("$ aws s3 cp");
    }
}
