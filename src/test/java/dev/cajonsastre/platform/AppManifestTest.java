package dev.cajonsastre.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AppManifestTest {

    private static AppManifest withId(String id) {
        return new AppManifest(id, "Prueba", "Una mini app de prueba", "app", AppColor.BLUE, AppCategory.UTILITIES,
                List.of(), false);
    }

    @ParameterizedTest
    @ValueSource(strings = {"tasks", "db", "json-tools", "app2", "a1-b2-c3"})
    void p01_accepts_valid_identifiers(String id) {
        assertThat(withId(id).id()).isEqualTo(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "a", "Tasks", "1app", "app-", "-app", "app_x", "app x", "tareas.v2", "ñu",
            "abcdefghijklmnopqrstuvwxyz0123456"})
    void p01_rejects_invalid_identifiers(String id) {
        assertThatThrownBy(() -> withId(id)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void p01_rejects_null_and_reserved_identifiers() {
        assertThatThrownBy(() -> withId(null)).isInstanceOf(IllegalArgumentException.class);
        for (String reserved : List.of("shell", "cajonsastre", "platform", "home")) {
            assertThatThrownBy(() -> withId(reserved)).hasMessageContaining("reservado");
        }
        assertThat(withId("a".repeat(32)).id()).hasSize(32);
    }

    @Test
    void p02_validates_name_description_and_keywords() {
        assertThatThrownBy(() -> new AppManifest("tasks", " ", "Gestor", "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY, null, false))
                .hasMessageContaining("nombre");
        assertThatThrownBy(() -> new AppManifest("tasks", "x".repeat(41), "Gestor", "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY, null, false))
                .hasMessageContaining("nombre");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "x".repeat(141), "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY, null, false))
                .hasMessageContaining("descripción");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "Gestor", "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY,
                Collections.nCopies(11, "k"), false)).hasMessageContaining("palabras clave");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "Gestor", "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY,
                List.of(" "), false)).hasMessageContaining("Palabra clave");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "Gestor", "Tasks.svg", AppColor.GREEN, AppCategory.PRODUCTIVITY, null, false))
                .hasMessageContaining("Icono");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "Gestor", "tasks", null, AppCategory.PRODUCTIVITY, null, false))
                .hasMessageContaining("color");
        assertThatThrownBy(() -> new AppManifest("tasks", "Tareas", "Gestor", "tasks", AppColor.GREEN, null, null, false))
                .hasMessageContaining("categoría");
    }

    @Test
    void p02_strips_texts_and_copies_keywords() {
        AppManifest m = new AppManifest("tasks", "  Tareas ", " Gestor de tareas ", "tasks", AppColor.GREEN,
                AppCategory.PRODUCTIVITY, null, true);
        assertThat(m.name()).isEqualTo("Tareas");
        assertThat(m.description()).isEqualTo("Gestor de tareas");
        assertThat(m.keywords()).isEmpty();
        assertThat(m.planned()).isTrue();
    }

    @Test
    void p02_colors_and_categories_are_closed_lists_in_lowercase_json() throws Exception {
        ObjectMapper json = new ObjectMapper();
        assertThat(List.of(AppColor.values()).stream().map(AppColor::id))
                .containsExactly("blue", "green", "violet", "orange", "cyan", "gold");
        assertThat(List.of(AppCategory.values()).stream().map(AppCategory::id))
                .containsExactly("data", "productivity", "utilities");
        assertThat(json.writeValueAsString(AppColor.VIOLET)).isEqualTo("\"violet\"");
        assertThat(json.writeValueAsString(AppCategory.DATA)).isEqualTo("\"data\"");
    }
}
