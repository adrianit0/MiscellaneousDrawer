package dev.cajonsastre.lifecycle;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.jar.Attributes;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Instalación en Ubuntu: C-11 a C-15 (ADR-0009). Los scripts se ejecutan de verdad solo en Linux, con un HOME
 * temporal, un JAR mínimo y un jpackage falso; en los demás sistemas se comprueban el lanzador y los scripts.
 */
class InstallerTest {

    private static final boolean LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");
    private static final Path INSTALL = Path.of("scripts/install.sh").toAbsolutePath();
    private static final Path UNINSTALL = Path.of("scripts/uninstall.sh").toAbsolutePath();
    private static final Path LAUNCHER = Path.of("packaging/cajonsastre.desktop");
    private static final Path ICON = Path.of("frontend/public/cajonsastre-icon.svg");

    @TempDir
    Path dir;
    Path home;
    Path jdk;
    Path jar;

    /** Lo que ejecuta el comando instalado sin jpackage: anota sus argumentos y opciones de la JVM. */
    public static final class RecordingMain {
        public static void main(String[] args) throws IOException {
            String line = String.join(" ", args) + " | " + String.join(" ",
                    ManagementFactory.getRuntimeMXBean().getInputArguments()) + "\n";
            Files.writeString(Path.of(System.getenv("HOME"), "jar.log"), line, StandardOpenOption.CREATE,
                    StandardOpenOption.APPEND);
        }
    }

    @BeforeEach
    void setUp() throws IOException {
        home = Files.createDirectories(dir.resolve("home"));
        jdk = Files.createDirectories(dir.resolve("jdk/bin"));
        jar = dir.resolve("cajonsastre.jar");
        writeJar(jar);
    }

    @Test
    void c11_the_launcher_is_named_and_grouped_with_the_window() throws IOException {
        List<String> lines = Files.readAllLines(LAUNCHER, StandardCharsets.UTF_8);
        assertThat(lines).contains("[Desktop Entry]", "Type=Application", "Name=Cajón de sastre", "Exec=@BIN@",
                "Icon=@ICON@", "Terminal=false", "StartupWMClass=" + Desktop.WINDOW_CLASS);
        assertThat(ICON).isRegularFile();
    }

    @Test
    void c08_c11_c15_the_scripts_only_remove_the_installed_application() throws IOException {
        for (Path script : List.of(INSTALL, UNINSTALL)) {
            String text = Files.readString(script, StandardCharsets.UTF_8);
            assertThat(text).startsWith("#!/usr/bin/env bash").contains("set -euo pipefail")
                    .contains("OPT=\"$HOME/.local/opt/cajonsastre\"").doesNotContainIgnoringCase("litedd")
                    .doesNotContainPattern("(?m)^\\s*sudo ");
            // Los datos, los ajustes y el registro nunca se borran: solo la carpeta de la aplicación y la temporal.
            assertThat(text.lines().filter(l -> l.contains("rm -rf")))
                    .isNotEmpty()
                    .allSatisfy(l -> assertThat(l).containsAnyOf("rm -rf \"$OPT\"", "rm -rf \"$WORK\""));
        }
    }

    @Test
    void c13_the_image_and_the_jar_use_the_jvm_options_of_the_architecture() throws IOException {
        String text = Files.readString(INSTALL, StandardCharsets.UTF_8);
        assertThat(text).contains("--java-options -Xmx384m --java-options -XX:+UseSerialGC")
                .contains("JAVA_OPTIONS=\"-Xmx384m -XX:+UseSerialGC\"");
    }

    @Test
    void c12_rejects_options_extra_arguments_and_missing_jars() throws Exception {
        linuxOnly();
        fakeJdk(true);
        assertThat(run(INSTALL, "a.jar", "b.jar")).satisfies(r -> {
            assertThat(r.code()).isEqualTo(2);
            assertThat(r.output()).contains("Uso:");
        });
        assertThat(run(INSTALL, "--help").code()).isEqualTo(2);
        assertThat(run(INSTALL, dir.resolve("missing.jar").toString())).satisfies(r -> {
            assertThat(r.code()).isEqualTo(1);
            assertThat(r.output()).contains("No existe el fichero");
        });
        assertThat(home.resolve(".local/opt/cajonsastre")).doesNotExist();
    }

    @Test
    void c11_c13_installs_the_jpackage_image_with_its_command_launcher_and_icon() throws Exception {
        linuxOnly();
        fakeJdk(true);
        Result r = run(INSTALL, jar.toString());
        assertThat(r.code()).as(r.output()).isZero();

        List<String> args = Files.readAllLines(jdk.resolveSibling("jpackage.args"));
        assertThat(String.join(" ", args)).contains("--type app-image --name cajonsastre")
                .contains("--main-jar cajonsastre.jar --main-class dev.cajonsastre.Main")
                .contains("--java-options -Xmx384m --java-options -XX:+UseSerialGC");

        Path opt = home.resolve(".local/opt/cajonsastre");
        Path command = opt.resolve("bin/cajonsastre");
        assertThat(Files.readString(command)).contains("fake image");
        assertThat(Files.isExecutable(command)).isTrue();
        assertThat(Files.isSymbolicLink(home.resolve(".local/bin/cajonsastre"))).isTrue();
        assertThat(Files.readSymbolicLink(home.resolve(".local/bin/cajonsastre"))).isEqualTo(command);
        try (Stream<Path> left = Files.list(home.resolve(".local/opt"))) {
            assertThat(left).containsExactly(opt);
        }

        Path icon = home.resolve(".local/share/icons/hicolor/scalable/apps/cajonsastre.svg");
        assertThat(icon).hasSameBinaryContentAs(ICON);
        List<String> launcher = Files.readAllLines(home.resolve(".local/share/applications/cajonsastre.desktop"));
        assertThat(launcher).contains("Exec=" + command, "Icon=" + icon, "StartupWMClass=cajonsastre",
                "Name=Cajón de sastre");
        assertThat(String.join("\n", launcher)).doesNotContain("@");
    }

    @Test
    void c13_without_a_working_jpackage_installs_the_jar_with_the_java_found() throws Exception {
        linuxOnly();
        fakeJdk(false);
        Result r = run(INSTALL, jar.toString());
        assertThat(r.code()).as(r.output()).isZero();
        assertThat(r.output()).contains("jpackage no pudo generar la imagen", "Se instala el JAR");

        Path opt = home.resolve(".local/opt/cajonsastre");
        assertThat(opt.resolve("lib/cajonsastre.jar")).hasSameBinaryContentAs(jar);
        assertThat(Files.readString(opt.resolve("bin/cajonsastre"))).contains(jdk.resolve("java").toString());

        Result started = run(home.resolve(".local/bin/cajonsastre"), "--no-window", "--port", "47999");
        assertThat(started.code()).as(started.output()).isZero();
        assertThat(Files.readString(home.resolve("jar.log")))
                .contains("--no-window --port 47999 |").contains("-Xmx384m").contains("-XX:+UseSerialGC");
    }

    @Test
    void c14_stops_the_running_instance_and_replaces_the_previous_installation() throws Exception {
        linuxOnly();
        fakeJdk(false);
        assertThat(run(INSTALL, jar.toString()).code()).isZero();
        Path leftover = Files.writeString(home.resolve(".local/opt/cajonsastre/old-file"), "x");

        Result r = run(INSTALL, jar.toString());
        assertThat(r.code()).as(r.output()).isZero();
        assertThat(Files.readString(home.resolve("jar.log"))).startsWith("--stop |");
        assertThat(leftover).doesNotExist();
        assertThat(home.resolve(".local/opt/cajonsastre/lib/cajonsastre.jar")).exists();
    }

    @Test
    void c15_uninstall_removes_the_application_and_keeps_the_data() throws Exception {
        linuxOnly();
        fakeJdk(false);
        assertThat(run(INSTALL, jar.toString()).code()).isZero();
        Path db = write(home.resolve(".local/share/cajonsastre/cajonsastre.db"));
        Path appData = write(home.resolve(".local/share/cajonsastre/apps/tasks/data.db"));
        Path config = write(home.resolve(".config/cajonsastre/config.json"));
        Path chrome = write(home.resolve(".local/state/cajonsastre/chrome/Local State"));

        Result r = run(UNINSTALL);
        assertThat(r.code()).as(r.output()).isZero();
        assertThat(r.output()).contains(home.resolve(".local/share/cajonsastre").toString());
        assertThat(Files.readString(home.resolve("jar.log"))).startsWith("--stop |");
        assertThat(home.resolve(".local/opt/cajonsastre")).doesNotExist();
        assertThat(home.resolve(".local/bin/cajonsastre")).doesNotExist();
        assertThat(home.resolve(".local/share/applications/cajonsastre.desktop")).doesNotExist();
        assertThat(home.resolve(".local/share/icons/hicolor/scalable/apps/cajonsastre.svg")).doesNotExist();
        assertThat(List.of(db, appData, config, chrome)).allSatisfy(p -> assertThat(p).exists());
    }

    private static void linuxOnly() {
        assumeTrue(LINUX, "Solo en Linux (ADR-0004, ADR-0009)");
    }

    /** JAVA_HOME con un java que delega en el de las pruebas y un jpackage falso que funciona o falla. */
    private void fakeJdk(boolean jpackageWorks) throws IOException {
        Path realJava = Path.of(System.getProperty("java.home"), "bin", "java");
        script(jdk.resolve("java"), "exec '" + realJava + "' \"$@\"");
        String image = "printf '#!/bin/sh\\n# fake image\\necho \"$*\" >> \"$HOME/image.log\"\\n' > \"$dest/$name/bin/$name\"";
        script(jdk.resolve("jpackage"), jpackageWorks
                ? String.join("\n",
                "printf '%s\\n' \"$@\" > \"$(dirname \"$0\")/../jpackage.args\"",
                "while [ $# -gt 0 ]; do",
                "  case \"$1\" in --dest) dest=\"$2\"; shift ;; --name) name=\"$2\"; shift ;; esac",
                "  shift",
                "done",
                "mkdir -p \"$dest/$name/bin\"",
                image,
                "chmod 755 \"$dest/$name/bin/$name\"")
                : "echo 'jlink failed' >&2; exit 1");
    }

    private static void script(Path path, String body) throws IOException {
        Files.writeString(path, "#!/bin/sh\n" + body + "\n");
        Files.setPosixFilePermissions(path, PosixFilePermissions.fromString("rwxr-xr-x"));
    }

    private static Path write(Path path) throws IOException {
        Files.createDirectories(path.getParent());
        return Files.writeString(path, "datos");
    }

    private static void writeJar(Path path) throws IOException {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");
        manifest.getMainAttributes().put(Attributes.Name.MAIN_CLASS, RecordingMain.class.getName());
        String entry = RecordingMain.class.getName().replace('.', '/') + ".class";
        try (OutputStream out = Files.newOutputStream(path);
             JarOutputStream jarOut = new JarOutputStream(out, manifest);
             InputStream in = InstallerTest.class.getClassLoader().getResourceAsStream(entry)) {
            jarOut.putNextEntry(new JarEntry(entry));
            in.transferTo(jarOut);
            jarOut.closeEntry();
        }
    }

    private record Result(int code, String output) {
    }

    private Result run(Path script, String... args) throws Exception {
        List<String> command = new ArrayList<>();
        if (script.toString().endsWith(".sh")) {
            command.add("bash");
        }
        command.add(script.toString());
        command.addAll(List.of(args));
        ProcessBuilder pb = new ProcessBuilder(command).redirectErrorStream(true);
        Map<String, String> env = pb.environment();
        env.put("HOME", home.toString());
        env.put("JAVA_HOME", jdk.getParent().toString());
        env.remove("XDG_DATA_HOME");
        env.remove("XDG_CONFIG_HOME");
        env.remove("XDG_STATE_HOME");
        Process p = pb.start();
        String output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(p.waitFor(60, TimeUnit.SECONDS)).isTrue();
        return new Result(p.exitValue(), output);
    }
}
