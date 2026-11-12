package dev.cajonsastre.settings;

import com.fasterxml.jackson.databind.JsonNode;
import dev.cajonsastre.ShellDatabase;
import dev.cajonsastre.TestApi;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.Store;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** D-04, D-05, U-06: ajustes de config.json y estado de interfaz del shell. */
class SettingsTest {

    @TempDir
    Path dir;
    Path configFile;
    Store store;
    AppSettings settings;
    TestApi api;

    @BeforeEach
    void start() {
        configFile = dir.resolve("config/config.json");
        store = ShellDatabase.open(dir.resolve("cajonsastre.db"), dir.resolve("backups"));
        settings = new AppSettings(configFile);
        api = TestApi.start(List.of(new SettingsApi(store, settings)));
    }

    @AfterEach
    void stop() {
        api.close();
        store.close();
    }

    @Test
    void d05_c08_defaults_without_file_use_port_47800_and_no_auto_shutdown() {
        JsonNode config = TestApi.json(api.get("/api/settings")).get("config");
        assertThat(config.get("port").asInt()).isEqualTo(47800);
        assertThat(config.get("autoShutdownMinutes").isNull()).isTrue();
        assertThat(Files.exists(configFile)).isFalse();
    }

    @Test
    void u06_d05_saves_the_config_to_config_json() throws IOException {
        HttpResponse<String> r = api.put("/api/settings", "{\"config\":{\"port\":47900,\"autoShutdownMinutes\":30}}");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(TestApi.json(r).get("config").get("port").asInt()).isEqualTo(47900);
        assertThat(Files.readString(configFile)).contains("\"port\" : 47900").contains("\"autoShutdownMinutes\" : 30");
        assertThat(new AppSettings(configFile).get()).isEqualTo(new AppConfig(47900, 30));
    }

    @Test
    void d05_rejects_out_of_range_values_and_keeps_the_previous_ones() {
        for (String body : List.of("{\"config\":{\"port\":80}}", "{\"config\":{\"port\":70000}}",
                "{\"config\":{\"port\":47800,\"autoShutdownMinutes\":0}}",
                "{\"config\":{\"port\":47800,\"autoShutdownMinutes\":1441}}")) {
            HttpResponse<String> r = api.put("/api/settings", body);
            assertThat(r.statusCode()).as(body).isEqualTo(400);
            assertThat(TestApi.json(r).get("code").asText()).isEqualTo("invalid_settings");
        }
        assertThat(settings.get()).isEqualTo(AppConfig.DEFAULT);
    }

    @Test
    void d05_an_invalid_or_partial_file_falls_back_to_defaults() throws IOException {
        Files.createDirectories(configFile.getParent());
        Files.writeString(configFile, "{ esto no es json");
        assertThat(new AppSettings(configFile).get()).isEqualTo(AppConfig.DEFAULT);
        Files.writeString(configFile, "{\"port\": 5}");
        assertThat(new AppSettings(configFile).get()).isEqualTo(AppConfig.DEFAULT);
        Files.writeString(configFile, "{\"autoShutdownMinutes\": 10, \"desconocido\": true}");
        assertThat(new AppSettings(configFile).get()).isEqualTo(new AppConfig(47800, 10));
    }

    @Test
    void d04_stores_shell_ui_state_keys_as_json() {
        api.put("/api/settings", "{\"shell.pinned\":[\"tasks\",\"database\"],\"shell.lastRoute\":\"#/apps/tasks\"}");
        JsonNode all = TestApi.json(api.get("/api/settings"));
        assertThat(all.get("shell.pinned")).extracting(JsonNode::asText).containsExactly("tasks", "database");
        assertThat(all.get("shell.lastRoute").asText()).isEqualTo("#/apps/tasks");
        // Solo cambian las claves enviadas.
        api.put("/api/settings", "{\"shell.recent\":[\"tasks\"]}");
        assertThat(TestApi.json(api.get("/api/settings")).get("shell.pinned")).hasSize(2);
    }

    @Test
    void d04_rejects_invalid_keys_and_bodies() {
        assertThat(api.put("/api/settings", "{\"clave con espacios\":1}").statusCode()).isEqualTo(400);
        assertThat(api.put("/api/settings", "[1]").statusCode()).isEqualTo(400);
    }

    @Test
    void r11_d05_the_repository_url_is_empty_by_default_and_saved_with_the_rest() throws IOException {
        assertThat(TestApi.json(api.get("/api/settings")).get("config").get("updateRepository").isNull()).isTrue();
        HttpResponse<String> r = api.put("/api/settings",
                "{\"config\":{\"port\":47800,\"autoShutdownMinutes\":null,\"updateRepository\":\"https://github.com/demo/app\"}}");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(Files.readString(configFile)).contains("\"updateRepository\" : \"https://github.com/demo/app\"");
        assertThat(new AppSettings(configFile).get().updateRepository()).isEqualTo("https://github.com/demo/app");
    }

    @Test
    void r11_saving_rejects_a_url_that_is_not_a_github_repository() {
        HttpResponse<String> r = api.put("/api/settings",
                "{\"config\":{\"port\":47800,\"updateRepository\":\"https://evil.example/demo/app\"}}");
        assertThat(r.statusCode()).isEqualTo(400);
        assertThat(TestApi.json(r).get("message").asText()).contains("https://github.com/");
        assertThat(settings.get()).isEqualTo(AppConfig.DEFAULT);
    }

    @Test
    void p24_d05_sound_and_desktop_notifications_are_on_by_default_and_saved_with_the_rest() throws IOException {
        JsonNode defaults = TestApi.json(api.get("/api/settings")).get("config");
        assertThat(defaults.get("notificationSound").asBoolean()).isTrue();
        assertThat(defaults.get("desktopNotifications").asBoolean()).isTrue();

        HttpResponse<String> r = api.put("/api/settings",
                "{\"config\":{\"port\":47800,\"notificationSound\":false,\"desktopNotifications\":false}}");
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(Files.readString(configFile)).contains("\"notificationSound\" : false")
                .contains("\"desktopNotifications\" : false");
        AppConfig saved = new AppSettings(configFile).get();
        assertThat(saved.notificationSound()).isFalse();
        assertThat(saved.desktopNotifications()).isFalse();

        // Un config.json anterior no los trae: valen los de por defecto.
        Files.writeString(configFile, "{\"port\": 47800}");
        assertThat(new AppSettings(configFile).get()).isEqualTo(AppConfig.DEFAULT);
    }

    @Test
    void d05_validate_gives_messages_apt_to_be_shown() {
        assertThatThrownBy(() -> new AppConfig(80, null).validate()).isInstanceOf(ApiError.class)
                .hasMessage("El puerto debe estar entre 1024 y 65535");
        assertThat(new AppConfig(null, null).port()).isEqualTo(AppConfig.DEFAULT_PORT);
    }
}
