package dev.cajonsastre.catalog;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P-18: el código Java de una mini app solo usa {@code dev.cajonsastre.platform} y su propio paquete. Se revisan las
 * importaciones y los nombres completos, y que no abra bases por su cuenta (P-08).
 */
class AppBoundariesTest {

    static final Path APPS = Path.of("src", "main", "java", "dev", "cajonsastre", "apps");
    private static final Pattern REFERENCE = Pattern.compile("\\bdev\\.cajonsastre\\.([A-Za-z_][\\w.]*)");

    static List<String> violations(Path appsRoot) {
        if (!Files.isDirectory(appsRoot)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        try (Stream<Path> files = Files.walk(appsRoot)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).sorted().toList()) {
                Path relative = appsRoot.relativize(file);
                if (relative.getNameCount() < 2) {
                    // package-info.java de dev.cajonsastre.apps: no es de ninguna mini app.
                    continue;
                }
                String appPackage = relative.getName(0).toString();
                String source = Files.readString(file, StandardCharsets.UTF_8);
                Matcher m = REFERENCE.matcher(source);
                while (m.find()) {
                    String target = m.group(1);
                    boolean allowed = target.startsWith("platform") || target.equals("apps." + appPackage)
                            || target.startsWith("apps." + appPackage + ".");
                    if (!allowed) {
                        out.add(relative.toString().replace('\\', '/') + ": usa dev.cajonsastre." + target);
                    }
                }
                if (source.contains("Store.open(")) {
                    out.add(relative.toString().replace('\\', '/') + ": abre una base con Store.open; la abre la plataforma (P-08)");
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }

    @Test
    void p18_the_real_mini_apps_only_use_the_platform_and_their_own_package() {
        assertThat(violations(APPS)).isEmpty();
    }

    @Test
    void p18_detects_imports_and_names_from_the_shell_or_other_apps(@TempDir Path apps) throws IOException {
        write(apps, "package-info.java", "/** */ package dev.cajonsastre.apps;");
        write(apps, "tasks/TasksApp.java", """
                package dev.cajonsastre.apps.tasks;

                import dev.cajonsastre.platform.MiniApp;
                import dev.cajonsastre.platform.AppRoutes;
                import dev.cajonsastre.apps.tasks.model.Task;
                import static dev.cajonsastre.apps.tasks.Limits.MAX;
                """);
        write(apps, "tasks/model/Task.java", "package dev.cajonsastre.apps.tasks.model;");
        write(apps, "notes/NotesApp.java", """
                package dev.cajonsastre.apps.notes;

                import dev.cajonsastre.catalog.AppRegistry;
                import dev.cajonsastre.apps.tasks.TasksApp;
                import dev.cajonsastre.platform.Store;

                class NotesApp {
                    Object path = dev.cajonsastre.DataPaths.dataDir();
                    Object other = Store.open(null, "tasks", null, null, null);
                }
                """);
        assertThat(violations(apps)).containsExactly(
                "notes/NotesApp.java: usa dev.cajonsastre.catalog.AppRegistry",
                "notes/NotesApp.java: usa dev.cajonsastre.apps.tasks.TasksApp",
                "notes/NotesApp.java: usa dev.cajonsastre.DataPaths.dataDir",
                "notes/NotesApp.java: abre una base con Store.open; la abre la plataforma (P-08)");
    }

    @Test
    void p18_a_package_named_like_another_app_prefix_is_not_its_own(@TempDir Path apps) throws IOException {
        write(apps, "task/TaskApp.java", "package dev.cajonsastre.apps.task;\nimport dev.cajonsastre.apps.tasks.X;");
        assertThat(violations(apps)).containsExactly("task/TaskApp.java: usa dev.cajonsastre.apps.tasks.X");
    }

    private static void write(Path root, String relative, String content) throws IOException {
        Path file = root.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
