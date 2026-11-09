package dev.cajonsastre.catalog;

import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.MiniApp;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AppCatalogTest {

    /** Las pruebas de Maven se ejecutan desde la raíz del proyecto. */
    static final Path FRONTEND = Path.of("frontend", "src");

    /** P-19: lo que le falta a un catálogo frente a la interfaz. */
    static List<String> missingFrontend(AppCatalog catalog, Path frontendSrc) {
        List<String> problems = new ArrayList<>();
        for (MiniApp app : catalog.apps()) {
            AppManifest m = app.manifest();
            if (!Files.isRegularFile(frontendSrc.resolve("shell/icons/" + m.icon() + ".svg"))) {
                problems.add(m.id() + ": no existe el icono " + m.icon());
            }
            if (!m.planned() && !Files.isRegularFile(frontendSrc.resolve("apps/" + m.id() + "/index.tsx"))) {
                problems.add(m.id() + ": no tiene interfaz en apps/" + m.id() + "/index.tsx");
            }
        }
        return problems;
    }

    @Test
    void p03_rejects_a_repeated_identifier() {
        MiniApp a = MiniApp.of(FixtureApps.manifest("tasks", true));
        MiniApp b = MiniApp.of(FixtureApps.manifest("tasks", false));
        assertThatThrownBy(() -> new AppCatalog(List.of(a, b))).hasMessageContaining("repetido").hasMessageContaining("tasks");
    }

    @Test
    void p03_finds_apps_by_identifier_in_declaration_order() {
        AppCatalog catalog = new AppCatalog(List.of(MiniApp.of(FixtureApps.manifest("b-app", true)),
                MiniApp.of(FixtureApps.manifest("a-app", true))));
        assertThat(catalog.apps()).extracting(a -> a.manifest().id()).containsExactly("b-app", "a-app");
        assertThat(catalog.contains("a-app")).isTrue();
        assertThat(catalog.find("c-app")).isEmpty();
    }

    @Test
    void adr0008_the_built_in_catalog_has_the_two_planned_apps() {
        AppCatalog catalog = AppCatalog.builtIn();
        assertThat(catalog.apps()).extracting(a -> a.manifest().id()).containsExactly("database", "tasks");
        AppManifest database = catalog.find("database").orElseThrow().manifest();
        assertThat(database.name()).isEqualTo("Base de datos");
        assertThat(database.color()).isEqualTo(AppColor.VIOLET);
        assertThat(database.category()).isEqualTo(AppCategory.DATA);
        assertThat(database.planned()).isTrue();
        AppManifest tasks = catalog.find("tasks").orElseThrow().manifest();
        assertThat(tasks.name()).isEqualTo("Tareas");
        assertThat(tasks.category()).isEqualTo(AppCategory.PRODUCTIVITY);
        assertThat(tasks.planned()).isTrue();
    }

    @Test
    void p19_every_app_of_the_real_catalog_has_its_icon_and_its_interface() {
        assertThat(Files.isDirectory(FRONTEND.resolve("shell/icons"))).as("frontend/src/shell/icons").isTrue();
        assertThat(missingFrontend(AppCatalog.builtIn(), FRONTEND)).isEmpty();
    }

    @Test
    void p19_reports_an_available_app_without_interface_or_with_an_unknown_icon(@TempDir Path src) throws IOException {
        Files.createDirectories(src.resolve("shell/icons"));
        Files.writeString(src.resolve("shell/icons/app.svg"), "<svg/>");
        Files.createDirectories(src.resolve("apps/with-ui"));
        Files.writeString(src.resolve("apps/with-ui/index.tsx"), "export default {};");
        AppCatalog catalog = new AppCatalog(List.of(
                MiniApp.of(FixtureApps.manifest("with-ui", false)),
                MiniApp.of(FixtureApps.manifest("planned-app", true)),
                MiniApp.of(FixtureApps.manifest("no-ui", false)),
                MiniApp.of(new AppManifest("bad-icon", "Icono", "Sin icono", "nope", AppColor.CYAN, AppCategory.DATA, null, true))));
        assertThat(missingFrontend(catalog, src)).containsExactly("no-ui: no tiene interfaz en apps/no-ui/index.tsx",
                "bad-icon: no existe el icono nope");
    }
}
