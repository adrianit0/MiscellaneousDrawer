package dev.cajonsastre.apps.database;

import dev.cajonsastre.apps.database.DumpLibrary.BranchDumps;
import dev.cajonsastre.apps.database.DumpLibrary.Dump;
import dev.cajonsastre.platform.ApiError;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.List;
import java.util.stream.Stream;

import static dev.cajonsastre.apps.database.Fixtures.MONDAY;
import static dev.cajonsastre.apps.database.Fixtures.TUESDAY;
import static dev.cajonsastre.apps.database.Fixtures.WEDNESDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-30 a BD-37: el volcado actual, la copia anterior y las conservadas. */
class DumpLibraryTest {

    @TempDir
    Path dir;
    DumpLibrary library;
    Path current;
    Path part;
    Path backups;

    @BeforeEach
    void setUp() {
        library = new DumpLibrary(dir, "_local.tar.gz", Fixtures.ZONE);
        current = library.current(Branch.HOTFIX);
        part = library.part(Branch.HOTFIX);
        backups = library.backups(Branch.HOTFIX);
    }

    private List<String> backupFiles() throws IOException {
        if (!Files.isDirectory(backups)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(backups)) {
            return files.map(p -> p.getFileName().toString()).sorted().toList();
        }
    }

    private static void assertCode(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiError.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.body().code()).isEqualTo(code);
        });
    }

    /** Una descarga terminada: deja part con ese contenido y esa fecha, y la instala. */
    private void download(String content, java.time.Instant modified, boolean rotate) throws IOException {
        Fixtures.write(part, content, modified);
        library.install(Branch.HOTFIX, part, rotate);
    }

    @Test
    void bd30_the_files_are_where_the_scripts_left_them() {
        assertThat(current).isEqualTo(dir.resolve("BBDD_hotfix_local.tar.gz"));
        assertThat(library.current(Branch.DEVELOP)).isEqualTo(dir.resolve("BBDD_develop_local.tar.gz"));
        assertThat(part).isEqualTo(dir.resolve("BBDD_hotfix_local.tar.gz.part"));
        assertThat(library.partMetaFile(Branch.HOTFIX)).isEqualTo(dir.resolve("BBDD_hotfix_local.tar.gz.part.json"));
        assertThat(backups).isEqualTo(dir.resolve("backups/hotfix"));
    }

    @Test
    void bd35_an_empty_library_has_nothing() throws IOException {
        assertThat(library.list(Branch.HOTFIX)).isEqualTo(new BranchDumps("hotfix", null, null, List.of(), null));
    }

    @Test
    void bd31_the_first_download_becomes_the_current_dump_without_a_previous_copy() throws IOException {
        download("lunes", MONDAY, true);
        BranchDumps dumps = library.list(Branch.HOTFIX);
        assertThat(dumps.current()).isEqualTo(new Dump("current", "BBDD_hotfix_local.tar.gz", null, 5, "2026-11-02T08:00:00Z"));
        assertThat(dumps.previous()).isNull();
        assertThat(Files.exists(part)).isFalse();
    }

    @Test
    void bd31_each_download_leaves_the_dump_it_replaces_as_the_only_previous_copy() throws IOException {
        download("lunes", MONDAY, true);
        download("martes", TUESDAY, true);
        assertThat(Files.readString(current)).isEqualTo("martes");
        assertThat(backupFiles()).containsExactly("auto-20261102-080000.tar.gz");
        assertThat(Files.readString(backups.resolve("auto-20261102-080000.tar.gz"))).isEqualTo("lunes");
        assertThat(library.list(Branch.HOTFIX).previous())
                .isEqualTo(new Dump("previous", "auto-20261102-080000.tar.gz", null, 5, "2026-11-02T08:00:00Z"));

        download("miércoles", WEDNESDAY, true);
        assertThat(Files.readString(current)).isEqualTo("miércoles");
        assertThat(backupFiles()).as("la del lunes ya no está").containsExactly("auto-20261103-083000.tar.gz");
        assertThat(Files.readString(backups.resolve("auto-20261103-083000.tar.gz"))).isEqualTo("martes");
    }

    @Test
    void bd30_the_date_in_the_name_is_the_local_time_of_the_dump() throws IOException {
        DumpLibrary madrid = new DumpLibrary(dir, "_local.tar.gz", ZoneId.of("Europe/Madrid"));
        Fixtures.write(current, "lunes", MONDAY);
        Fixtures.write(part, "martes", TUESDAY);
        madrid.install(Branch.HOTFIX, part, true);
        assertThat(backupFiles()).containsExactly("auto-20261102-090000.tar.gz");
    }

    @Test
    void bd25_a_forced_download_of_the_same_dump_replaces_it_without_rotating() throws IOException {
        download("lunes", MONDAY, true);
        download("martes", TUESDAY, true);
        download("martes otra vez", TUESDAY, false);
        assertThat(Files.readString(current)).isEqualTo("martes otra vez");
        assertThat(backupFiles()).as("la copia anterior sigue siendo la del lunes").containsExactly("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd31_if_the_new_dump_cannot_be_placed_the_one_that_was_there_returns() throws IOException {
        download("lunes", MONDAY, true);
        download("martes", TUESDAY, true);
        // No hay .part: colocar el nuevo falla.
        assertThatThrownBy(() -> library.install(Branch.HOTFIX, part, true)).isInstanceOf(IOException.class);
        assertThat(Files.readString(current)).isEqualTo("martes");
        assertThat(backupFiles()).as("la copia anterior no se ha borrado").contains("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd31_the_branches_do_not_mix() throws IOException {
        download("hotfix lunes", MONDAY, true);
        Fixtures.write(library.part(Branch.DEVELOP), "develop lunes", MONDAY);
        library.install(Branch.DEVELOP, library.part(Branch.DEVELOP), true);
        Fixtures.write(library.part(Branch.DEVELOP), "develop martes", TUESDAY);
        library.install(Branch.DEVELOP, library.part(Branch.DEVELOP), true);
        assertThat(Files.readString(current)).isEqualTo("hotfix lunes");
        assertThat(backupFiles()).isEmpty();
        assertThat(library.list(Branch.DEVELOP).previous().file()).isEqualTo("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd32_keeping_the_current_dump_creates_a_named_copy_that_survives_the_rotations() throws IOException {
        download("lunes", MONDAY, true);
        Dump kept = library.keep(Branch.HOTFIX, "current", "  antes de la versión 2.0  ");
        assertThat(kept).isEqualTo(new Dump("kept", "kept-20261102-080000-antes de la versión 2.0.tar.gz",
                "antes de la versión 2.0", 5, "2026-11-02T08:00:00Z"));
        assertThat(Files.readString(current)).as("el original sigue en su sitio").isEqualTo("lunes");

        download("martes", TUESDAY, true);
        download("miércoles", WEDNESDAY, true);
        assertThat(backupFiles()).containsExactly("auto-20261103-083000.tar.gz",
                "kept-20261102-080000-antes de la versión 2.0.tar.gz");
        assertThat(Files.readString(backups.resolve(kept.file()))).isEqualTo("lunes");
    }

    @Test
    void bd32_it_is_a_hard_link_and_not_a_second_copy() throws IOException {
        download("lunes", MONDAY, true);
        Dump kept = library.keep(Branch.HOTFIX, "current", "base");
        Object key = Files.readAttributes(current, java.nio.file.attribute.BasicFileAttributes.class).fileKey();
        if (key != null) {
            // En sistemas POSIX los dos nombres son el mismo fichero.
            assertThat(Files.readAttributes(backups.resolve(kept.file()), java.nio.file.attribute.BasicFileAttributes.class).fileKey())
                    .isEqualTo(key);
        }
        assertThat(Files.isSameFile(current, backups.resolve(kept.file())) || key == null).isTrue();
    }

    @Test
    void bd32_keeping_the_previous_copy_leaves_it_as_previous_too() throws IOException {
        download("lunes", MONDAY, true);
        download("martes", TUESDAY, true);
        library.keep(Branch.HOTFIX, "auto-20261102-080000.tar.gz", "Lunes_bueno");
        BranchDumps dumps = library.list(Branch.HOTFIX);
        assertThat(dumps.previous().file()).isEqualTo("auto-20261102-080000.tar.gz");
        assertThat(dumps.kept()).extracting(Dump::name).containsExactly("Lunes_bueno");
        // Solo el actual o la anterior.
        assertCode(() -> keep("kept-20261102-080000-Lunes_bueno.tar.gz", "otra"), 400, "invalid_request");
        assertCode(() -> keep("auto-20260101-000000.tar.gz", "otra"), 404, "dump_not_found");
    }

    private void keep(String source, String name) {
        try {
            library.keep(Branch.HOTFIX, source, name);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", ".oculta", "acaba.", "con/barra", "con\\barra", "..", "a..", "dos:puntos", "interrogación?",
            "este nombre tiene más de cuarenta caracteres"})
    void bd33_rejects_names_that_are_not_valid(String name) throws IOException {
        download("lunes", MONDAY, true);
        assertCode(() -> keep("current", name), 400, "invalid_name");
        assertThat(backupFiles()).isEmpty();
    }

    @Test
    void bd33_a_name_cannot_be_repeated_in_a_branch_whatever_its_case() throws IOException {
        download("lunes", MONDAY, true);
        library.keep(Branch.HOTFIX, "current", "Base");
        download("martes", TUESDAY, true);
        assertCode(() -> keep("current", "base"), 409, "name_taken");
        // En otra rama sí.
        Fixtures.write(library.current(Branch.DEVELOP), "develop", MONDAY);
        assertThat(library.keep(Branch.DEVELOP, "current", "base").name()).isEqualTo("base");
    }

    @Test
    void bd34_deletes_a_copy_but_never_the_current_dump() throws IOException {
        download("lunes", MONDAY, true);
        download("martes", TUESDAY, true);
        Dump kept = library.keep(Branch.HOTFIX, "current", "martes");
        library.delete(Branch.HOTFIX, "auto-20261102-080000.tar.gz");
        library.delete(Branch.HOTFIX, kept.file());
        assertThat(backupFiles()).isEmpty();
        assertThat(Files.readString(current)).as("borrar el enlace no borra el actual").isEqualTo("martes");

        assertCode(() -> delete("current"), 400, "invalid_request");
        assertCode(() -> delete("BBDD_hotfix_local.tar.gz"), 400, "invalid_request");
        assertCode(() -> delete("auto-20261102-080000.tar.gz"), 404, "dump_not_found");
    }

    private void delete(String file) {
        try {
            library.delete(Branch.HOTFIX, file);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"../BBDD_hotfix_local.tar.gz", "..", "auto-20261102-080000.tar.gz/../../x", "/etc/passwd",
            "kept-20261102-080000-../../x.tar.gz", "kept-20261102-080000-a/b.tar.gz", "auto-2026.tar.gz", "otra-cosa.tar.gz", ""})
    void bd37_a_file_name_from_the_api_can_never_leave_the_backups_folder(String file) throws IOException {
        download("lunes", MONDAY, true);
        Files.writeString(dir.resolve("x"), "fuera");
        assertCode(() -> delete(file), 400, "invalid_request");
        assertCode(() -> library.resolve(Branch.HOTFIX, file), 400, "invalid_request");
        assertCode(() -> keep(file, "nombre"), 400, "invalid_request");
        assertThat(Files.exists(current)).isTrue();
        assertThat(Files.exists(dir.resolve("x"))).isTrue();
    }

    @Test
    void bd40_resolves_the_current_dump_and_the_copies_of_its_branch() throws IOException {
        assertThat(library.resolve(Branch.DEVELOP, "current")).isEqualTo(dir.resolve("BBDD_develop_local.tar.gz"));
        assertThat(library.resolve(Branch.HOTFIX, "auto-20261102-080000.tar.gz"))
                .isEqualTo(dir.resolve("backups/hotfix/auto-20261102-080000.tar.gz"));
        assertThat(library.resolve(Branch.HOTFIX, "kept-20261102-080000-base 1.tar.gz"))
                .isEqualTo(dir.resolve("backups/hotfix/kept-20261102-080000-base 1.tar.gz"));
    }

    @Test
    void bd35_lists_the_copies_from_newest_to_oldest_and_ignores_other_files() throws IOException {
        Fixtures.write(current, "miércoles", WEDNESDAY);
        Fixtures.write(backups.resolve("auto-20261103-083000.tar.gz"), "martes", TUESDAY);
        Fixtures.write(backups.resolve("kept-20261102-080000-lunes.tar.gz"), "lunes", MONDAY);
        Fixtures.write(backups.resolve("kept-20261103-083000-martes.tar.gz"), "martes", TUESDAY);
        Fixtures.write(backups.resolve("notas.txt"), "no es una copia", MONDAY);
        Fixtures.write(backups.resolve("kept-20261103-083000-.oculta.tar.gz"), "nombre no válido", MONDAY);
        Fixtures.write(dir.resolve("BBDD_hotfix_local.tar.gz.backup"), "copia de los scripts antiguos", MONDAY);
        Files.createDirectories(backups.resolve("auto-20261101-000000.tar.gz"));

        BranchDumps dumps = library.list(Branch.HOTFIX);
        assertThat(dumps.branch()).isEqualTo("hotfix");
        assertThat(dumps.current().size()).isEqualTo(10);
        assertThat(dumps.previous().file()).isEqualTo("auto-20261103-083000.tar.gz");
        assertThat(dumps.kept()).extracting(Dump::name).containsExactly("martes", "lunes");
        assertThat(dumps.partial()).isNull();
    }

    @Test
    void bd35_reports_a_download_left_halfway() throws IOException {
        Files.writeString(part, "medio");
        assertThat(library.list(Branch.HOTFIX).partial()).isEqualTo(new DumpLibrary.Partial(5, null));
        library.writePartMeta(Branch.HOTFIX, new DumpLibrary.PartMeta("\"abc\"", 20));
        assertThat(library.list(Branch.HOTFIX).partial()).isEqualTo(new DumpLibrary.Partial(5, 20L));
        assertThat(library.readPartMeta(Branch.HOTFIX)).isEqualTo(new DumpLibrary.PartMeta("\"abc\"", 20));
        Files.writeString(library.partMetaFile(Branch.HOTFIX), "roto");
        assertThat(library.readPartMeta(Branch.HOTFIX)).isNull();
    }
}
