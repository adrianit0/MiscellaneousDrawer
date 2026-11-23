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
    void adr0011_adr0016_adr0018_adr0019_adr0020_adr0023_adr0026_adr0027_the_built_in_catalog_has_nine_apps_available_and_none_planned() {
        AppCatalog catalog = AppCatalog.builtIn();
        assertThat(catalog.apps()).extracting(a -> a.manifest().id())
                .containsExactly("database", "quality", "processes", "repos", "gestask", "jira", "resubmit", "lootboxes",
                        "inventory");
        AppManifest lootboxes = catalog.find("lootboxes").orElseThrow().manifest();
        assertThat(lootboxes.name()).isEqualTo("Lootboxes");
        assertThat(lootboxes.description()).isEqualTo("Cofres que se consiguen con los PE de Gestask");
        assertThat(lootboxes.icon()).isEqualTo("chest");
        assertThat(lootboxes.color()).isEqualTo(AppColor.ORANGE);
        assertThat(lootboxes.category()).isEqualTo(AppCategory.LEISURE);
        assertThat(lootboxes.planned()).isFalse();
        AppManifest inventory = catalog.find("inventory").orElseThrow().manifest();
        assertThat(inventory.name()).isEqualTo("Inventario");
        assertThat(inventory.description()).isEqualTo("Los objetos conseguidos en los cofres");
        assertThat(inventory.icon()).isEqualTo("inventory");
        assertThat(inventory.color()).isEqualTo(AppColor.VIOLET);
        assertThat(inventory.category()).isEqualTo(AppCategory.LEISURE);
        assertThat(inventory.planned()).isFalse();
        assertThat(catalog.find("tasks")).isEmpty();
        AppManifest jira = catalog.find("jira").orElseThrow().manifest();
        assertThat(jira.name()).isEqualTo("Tableros Jira");
        assertThat(jira.description()).isEqualTo("Tus columnas sobre los estados de varios proyectos de Jira Cloud");
        assertThat(jira.icon()).isEqualTo("board");
        assertThat(jira.color()).isEqualTo(AppColor.CYAN);
        assertThat(jira.category()).isEqualTo(AppCategory.PRODUCTIVITY);
        assertThat(jira.planned()).isFalse();
        AppManifest resubmit = catalog.find("resubmit").orElseThrow().manifest();
        assertThat(resubmit.name()).isEqualTo("Reenviar PR");
        assertThat(resubmit.description()).isEqualTo("Vuelve a pedir los PR de hotfix rechazados al cerrar una versión");
        assertThat(resubmit.icon()).isEqualTo("resubmit");
        assertThat(resubmit.color()).isEqualTo(AppColor.GREEN);
        assertThat(resubmit.category()).isEqualTo(AppCategory.UTILITIES);
        assertThat(resubmit.planned()).isFalse();
        AppManifest gestask = catalog.find("gestask").orElseThrow().manifest();
        assertThat(gestask.name()).isEqualTo("Gestask");
        assertThat(gestask.description()).isEqualTo("Tareas, parte diario, horario y calendario sobre Supabase");
        assertThat(gestask.icon()).isEqualTo("tasks");
        assertThat(gestask.color()).isEqualTo(AppColor.GOLD);
        assertThat(gestask.category()).isEqualTo(AppCategory.PRODUCTIVITY);
        assertThat(gestask.planned()).isFalse();
        AppManifest repos = catalog.find("repos").orElseThrow().manifest();
        assertThat(repos.name()).isEqualTo("Repositorios");
        assertThat(repos.description()).isEqualTo("Mantiene al día los repositorios git del proyecto");
        assertThat(repos.icon()).isEqualTo("repos");
        assertThat(repos.color()).isEqualTo(AppColor.BLUE);
        assertThat(repos.category()).isEqualTo(AppCategory.UTILITIES);
        assertThat(repos.planned()).isFalse();
        AppManifest processes = catalog.find("processes").orElseThrow().manifest();
        assertThat(processes.name()).isEqualTo("Cerrar procesos");
        assertThat(processes.description()).isEqualTo("Cierra programas colgados y libera sus puertos");
        assertThat(processes.icon()).isEqualTo("processes");
        assertThat(processes.color()).isEqualTo(AppColor.ORANGE);
        assertThat(processes.category()).isEqualTo(AppCategory.UTILITIES);
        assertThat(processes.planned()).isFalse();
        AppManifest quality = catalog.find("quality").orElseThrow().manifest();
        assertThat(quality.name()).isEqualTo("Calidad del dato");
        assertThat(quality.description()).isEqualTo("Comprueba los datos de la base local con scripts SQL");
        assertThat(quality.icon()).isEqualTo("quality");
        assertThat(quality.color()).isEqualTo(AppColor.CYAN);
        assertThat(quality.category()).isEqualTo(AppCategory.DATA);
        assertThat(quality.planned()).isFalse();
        AppManifest database = catalog.find("database").orElseThrow().manifest();
        assertThat(database.name()).isEqualTo("Base de datos");
        assertThat(database.description()).isEqualTo("Descarga, importa y prepara la base de datos local");
        assertThat(database.color()).isEqualTo(AppColor.VIOLET);
        assertThat(database.category()).isEqualTo(AppCategory.DATA);
        assertThat(database.planned()).isFalse();
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
