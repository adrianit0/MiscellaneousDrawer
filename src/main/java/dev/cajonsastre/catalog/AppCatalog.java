package dev.cajonsastre.catalog;

import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.MiniApp;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * P-03: el único sitio donde se declaran las mini apps. Añadir una es añadir su línea en {@link #builtIn()}
 * ({@code specs/diseno/mini-apps.md}, «Añadir una mini app»).
 */
public final class AppCatalog {

    private final List<MiniApp> apps;
    private final Map<String, MiniApp> byId = new LinkedHashMap<>();

    /** P-03: un identificador repetido es un error de programación e impide arrancar. */
    public AppCatalog(List<MiniApp> apps) {
        this.apps = List.copyOf(apps);
        for (MiniApp app : this.apps) {
            AppManifest m = app.manifest();
            if (byId.putIfAbsent(m.id(), app) != null) {
                throw new IllegalArgumentException("Identificador de mini app repetido en el catálogo: " + m.id());
            }
        }
    }

    /** El catálogo de la aplicación (ADR-0008). */
    public static AppCatalog builtIn() {
        return new AppCatalog(List.of(
                MiniApp.of(new AppManifest("database", "Base de datos", "Gestor de bases de datos", "database",
                        AppColor.VIOLET, AppCategory.DATA, List.of("sql", "tablas", "consultas"), true)),
                MiniApp.of(new AppManifest("tasks", "Tareas", "Gestor de tareas", "tasks",
                        AppColor.GREEN, AppCategory.PRODUCTIVITY, List.of("pendientes", "listas", "por hacer"), true))));
    }

    /** En el orden de declaración, que es el de arranque (P-10). */
    public List<MiniApp> apps() {
        return apps;
    }

    public Optional<MiniApp> find(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    public boolean contains(String id) {
        return byId.containsKey(id);
    }
}
