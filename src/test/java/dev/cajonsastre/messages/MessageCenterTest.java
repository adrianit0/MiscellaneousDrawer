package dev.cajonsastre.messages;

import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppPaths;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.platform.AppCategory;
import dev.cajonsastre.platform.AppColor;
import dev.cajonsastre.platform.AppContext;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.AppRoutes;
import dev.cajonsastre.platform.Message;
import dev.cajonsastre.platform.Messages;
import dev.cajonsastre.platform.MiniApp;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Mensajes entre mini apps: P-29 a P-32 (ADR-0025). */
class MessageCenterTest {

    private static final AppManifest GESTASK = manifest("gestask");
    private static final AppManifest LOOT = manifest("lootboxes");
    private static final AppManifest INVENTORY = manifest("inventory");

    @TempDir
    Path dir;
    Store store;
    final Set<String> known = new HashSet<>(Set.of("gestask", "lootboxes", "inventory"));
    MessageCenter center;

    private static AppManifest manifest(String id) {
        return new AppManifest(id, "Prueba " + id, "Mini app de prueba", "app", AppColor.BLUE, AppCategory.UTILITIES,
                List.of(), false);
    }

    @BeforeEach
    void open() {
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        center = new MessageCenter(store, Clock.fixed(Instant.parse("2026-11-22T07:30:15.400Z"), ZoneOffset.UTC),
                known::contains);
    }

    @AfterEach
    void close() {
        store.close();
    }

    @Test
    void p29_send_stores_with_sender_type_and_date() {
        center.forApp(GESTASK).send("lootboxes", "effort-points", "{\"date\":\"2026-11-21\",\"points\":5}");

        List<Message> pending = center.forApp(LOOT).pending();
        assertThat(pending).hasSize(1);
        Message m = pending.get(0);
        assertThat(m.sender()).isEqualTo("gestask");
        assertThat(m.type()).isEqualTo("effort-points");
        assertThat(m.content()).isEqualTo("{\"date\":\"2026-11-21\",\"points\":5}");
        assertThat(m.sentAt()).isEqualTo("2026-11-22T07:30:15Z");
    }

    @Test
    void p29_content_up_to_64_kb_is_accepted() {
        assertThat(Messages.MAX_CONTENT).isEqualTo(64 * 1024);
        // ADR-0030: una lista de tickets de unos 60 KB cabe en un mensaje.
        String big = "{\"x\":\"" + "a".repeat(Messages.MAX_CONTENT - 8) + "\"}";
        center.forApp(GESTASK).send("lootboxes", "effort-points", big);
        assertThat(center.forApp(LOOT).pending()).extracting(Message::content).containsExactly(big);
    }

    @Test
    void p29_invalid_values_are_programming_errors() {
        Messages gestask = center.forApp(GESTASK);
        assertThatThrownBy(() -> gestask.send("unknown", "effort-points", "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gestask.send("gestask", "effort-points", "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gestask.send("lootboxes", "Effort", "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gestask.send("lootboxes", "a".repeat(41), "{}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gestask.send("lootboxes", "effort-points", "[1]"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> gestask.send("lootboxes", "effort-points", "{no es json"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageNotContaining("no es json");
        assertThatThrownBy(() -> gestask.send("lootboxes", "effort-points",
                "{\"x\":\"" + "a".repeat(Messages.MAX_CONTENT) + "\"}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(center.forApp(LOOT).pending()).isEmpty();
    }

    @Test
    void p30_pending_is_redelivered_until_acked_and_in_order() {
        Messages gestask = center.forApp(GESTASK);
        Messages loot = center.forApp(LOOT);
        gestask.send("lootboxes", "effort-points", "{\"n\":1}");
        gestask.send("lootboxes", "effort-points", "{\"n\":2}");

        assertThat(loot.pending()).extracting(Message::content).containsExactly("{\"n\":1}", "{\"n\":2}");
        assertThat(loot.pending()).extracting(Message::content).containsExactly("{\"n\":1}", "{\"n\":2}");

        loot.ack(loot.pending().get(0).id());
        assertThat(loot.pending()).extracting(Message::content).containsExactly("{\"n\":2}");
    }

    @Test
    void p30_pending_returns_at_most_a_page() {
        Messages gestask = center.forApp(GESTASK);
        for (int i = 0; i < Messages.PAGE + 5; i++) {
            gestask.send("lootboxes", "effort-points", "{\"n\":" + i + "}");
        }
        List<Message> first = center.forApp(LOOT).pending();
        assertThat(first).hasSize(Messages.PAGE);
        assertThat(first.get(0).content()).isEqualTo("{\"n\":0}");
    }

    @Test
    void p30_p31_an_app_only_sees_and_acks_its_own() {
        center.forApp(GESTASK).send("lootboxes", "effort-points", "{}");
        center.forApp(LOOT).send("inventory", "chest-rewards", "{}");

        assertThat(center.forApp(GESTASK).pending()).isEmpty();
        long forLoot = center.forApp(LOOT).pending().get(0).id();
        // Confirmar uno que no es suyo no hace nada.
        center.forApp(INVENTORY).ack(forLoot);
        center.forApp(INVENTORY).ack(99_999);
        assertThat(center.forApp(LOOT).pending()).hasSize(1);
        assertThat(center.forApp(INVENTORY).pending()).extracting(Message::sender).containsExactly("lootboxes");
    }

    @Test
    void p32_messages_survive_a_restart_and_a_sender_leaving_the_catalog() {
        center.forApp(GESTASK).send("lootboxes", "effort-points", "{}");
        store.close();
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        known.remove("gestask");
        center = new MessageCenter(store, Clock.systemUTC(), known::contains);

        assertThat(center.forApp(LOOT).pending()).extracting(Message::sender).containsExactly("gestask");
    }

    @Test
    void p29_the_registry_gives_each_app_its_own_mailbox() {
        Probe sender = new Probe("gestask");
        Probe recipient = new Probe("lootboxes");
        AppPaths paths = new AppPaths(dir.resolve("data"), dir.resolve("config"), dir.resolve("backups"));
        try (AppRegistry r = AppRegistry.start(new AppCatalog(List.of(sender, recipient)), paths, Clock.systemUTC(),
                m -> (title, text, kind, path) -> {
                }, m -> name -> null, center::forApp)) {
            sender.context.messages().send("lootboxes", "effort-points", "{\"points\":3}");
            assertThat(recipient.context.messages().pending()).extracting(Message::sender).containsExactly("gestask");
            assertThat(sender.context.messages().pending()).isEmpty();
        }
    }

    private static final class Probe implements MiniApp {
        final AppManifest manifest;
        AppContext context;

        Probe(String id) {
            this.manifest = MessageCenterTest.manifest(id);
        }

        @Override
        public AppManifest manifest() {
            return manifest;
        }

        @Override
        public void start(AppContext context, AppRoutes routes) {
            this.context = context;
        }
    }
}
