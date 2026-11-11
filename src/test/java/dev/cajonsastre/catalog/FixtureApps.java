package dev.cajonsastre.catalog;

import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.nio.file.Files;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Mini apps que solo existen en las pruebas, para probar el contrato de la plataforma (ADR-0008). */
final class FixtureApps {

    private FixtureApps() {
    }

    static AppManifest manifest(String id, boolean planned) {
        return new AppManifest(id, "Prueba " + id, "Mini app de prueba", "app", AppColor.BLUE, AppCategory.UTILITIES,
                List.of("prueba"), planned);
    }

    public interface ItemMapper {
        @Select("SELECT title FROM item ORDER BY id")
        List<String> titles();

        @Insert("INSERT INTO item (title) VALUES (#{title})")
        void insert(@Param("title") String title);
    }

    record Item(String title) {
    }

    /** Con base, mapper y rutas. Anota en stopped el orden de apagado. */
    static final class Notes implements MiniApp {
        final List<String> stopped;
        final String id;
        AppContext context;

        Notes(String id, List<String> stopped) {
            this.id = id;
            this.stopped = stopped;
        }

        @Override
        public AppManifest manifest() {
            return FixtureApps.manifest(id, false);
        }

        @Override
        public List<String> migrations() {
            return List.of("db/apps/fixture-notes/V001__initial.sql".replace("fixture-notes", id));
        }

        @Override
        public List<Class<?>> mappers() {
            return List.of(ItemMapper.class);
        }

        @Override
        public void start(AppContext context, AppRoutes routes) {
            this.context = context;
            routes.get("/items", ctx -> ctx.json(context.store().read(s -> s.getMapper(ItemMapper.class).titles())));
            routes.post("/items", ctx -> {
                Item item = ctx.bodyAsClass(Item.class);
                context.store().write(s -> {
                    s.getMapper(ItemMapper.class).insert(item.title());
                    return null;
                });
                ctx.status(201).json(item);
            });
            routes.get("/dirs", ctx -> ctx.json(Map.of(
                    "data", Files.isDirectory(context.dataDir()),
                    "config", Files.isDirectory(context.configDir()))));
        }

        @Override
        public void stop() {
            stopped.add(id);
        }
    }

    /** Sin base: solo rutas. */
    static final class Echo implements MiniApp {
        final List<String> stopped;

        Echo(List<String> stopped) {
            this.stopped = stopped;
        }

        @Override
        public AppManifest manifest() {
            return FixtureApps.manifest("fixture-echo", false);
        }

        @Override
        public void start(AppContext context, AppRoutes routes) {
            routes.get("/hello", ctx -> ctx.json(Map.of("app", context.appId())));
            routes.get("/store", ctx -> ctx.json(context.store()));
        }

        @Override
        public void stop() {
            stopped.add("fixture-echo");
            throw new IllegalStateException("fallo al apagar");
        }
    }

    /** P-20: ocupada mientras reason no sea null; con fail, preguntarle lanza. */
    static final class Worker implements MiniApp {
        final String id;
        volatile String reason;
        volatile boolean fail;

        Worker(String id) {
            this.id = id;
        }

        @Override
        public AppManifest manifest() {
            return FixtureApps.manifest(id, false);
        }

        @Override
        public Optional<String> busy() {
            if (fail) {
                throw new IllegalStateException("fallo al preguntar");
            }
            return Optional.ofNullable(reason);
        }
    }

    static MiniApp throwing() {
        return new MiniApp() {
            @Override
            public AppManifest manifest() {
                return FixtureApps.manifest("fixture-throws", false);
            }

            @Override
            public void start(AppContext context, AppRoutes routes) {
                routes.get("/never", ctx -> ctx.result("no debería publicarse"));
                throw new IllegalStateException("Falta la configuración de prueba");
            }
        };
    }

    static MiniApp brokenMigration() {
        return new MiniApp() {
            @Override
            public AppManifest manifest() {
                return FixtureApps.manifest("fixture-broken", false);
            }

            @Override
            public List<String> migrations() {
                return List.of("db/apps/fixture-broken/V001__initial.sql");
            }
        };
    }

    static MiniApp badRoute() {
        return new MiniApp() {
            @Override
            public AppManifest manifest() {
                return FixtureApps.manifest("fixture-bad-route", false);
            }

            @Override
            public void start(AppContext context, AppRoutes routes) {
                routes.get("/../catalog", ctx -> ctx.result("fuera de su espacio"));
            }
        };
    }

    /** Intenta usar las migraciones de otra mini app (P-08). */
    static MiniApp foreignMigrations() {
        return new MiniApp() {
            @Override
            public AppManifest manifest() {
                return FixtureApps.manifest("fixture-foreign", false);
            }

            @Override
            public List<String> migrations() {
                return List.of("db/apps/fixture-notes/V001__initial.sql");
            }
        };
    }
}
