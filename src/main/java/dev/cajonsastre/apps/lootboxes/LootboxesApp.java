package dev.cajonsastre.apps.lootboxes;

import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.MiniApp;

import java.security.SecureRandom;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.random.RandomGenerator;

/**
 * «Lootboxes» (LB-01 a LB-27, ADR-0026): cofres que se consiguen con los PE cerrados en «Gestask» y se abren desde
 * las 8:00 del día siguiente. Sus objetos pasan a «Inventario» por el buzón de la plataforma (ADR-0025).
 */
public final class LootboxesApp implements MiniApp {

    static final AppManifest MANIFEST = new AppManifest("lootboxes", "Lootboxes",
            "Cofres que se consiguen con los PE de Gestask", "chest", AppColor.ORANGE, AppCategory.LEISURE,
            List.of("cofres", "ocio", "orbes", "botín", "daily"), false);

    private final ZoneId zone;
    private final RandomGenerator random;

    public LootboxesApp() {
        this(ZoneId.systemDefault(), new SecureRandom());
    }

    /** Para las pruebas: la zona horaria y el azar. */
    LootboxesApp(ZoneId zone, RandomGenerator random) {
        this.zone = zone;
        this.random = random;
    }

    @Override
    public AppManifest manifest() {
        return MANIFEST;
    }

    @Override
    public List<String> migrations() {
        return List.of("db/apps/lootboxes/V001__initial.sql");
    }

    @Override
    public List<Class<?>> mappers() {
        return List.of(LootMapper.class);
    }

    @Override
    public void start(AppContext context, AppRoutes routes) {
        Chests chests = new Chests(context.store(), context.messages(), context.clock(), zone, random);
        chests.begin();
        chests.sync();

        routes.get("/chests", ctx -> {
            chests.sync();
            ctx.json(Map.of("chests", chests.unlocked().stream()
                    .map(c -> Map.of("id", c.id(), "earnedOn", c.earnedOn())).toList()));
        });
        routes.post("/chests/open-all", ctx -> ctx.json(Map.of("opened", chests.openAll().stream()
                .map(LootboxesApp::view).toList())));
        routes.post("/chests/{id}/open", ctx -> ctx.json(view(chests.open(ctx.pathParam("id")))));
    }

    private static Map<String, Object> view(Chests.Opened opened) {
        return Map.of("chest", opened.chest(), "items", opened.items().stream()
                .map(i -> Map.of("id", i.id(), "name", i.name(), "rarity", i.rarity())).toList());
    }
}
