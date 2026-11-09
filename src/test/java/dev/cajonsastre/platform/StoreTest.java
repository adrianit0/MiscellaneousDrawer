package dev.cajonsastre.platform;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Store y Migrator: D-01, D-02, D-03, D-06, D-07 y las copias por base de P-08. */
class StoreTest {

    @TempDir
    Path dir;

    private static final List<String> A = List.of("test-migrations/V001__a.sql");
    private static final List<String> AB = List.of("test-migrations/V001__a.sql", "test-migrations/V002__b.sql");

    public interface NameMapper {
        @Select("SELECT group_concat(name, ',') FROM (SELECT name FROM t ORDER BY name)")
        String names();

        @Insert("INSERT INTO t (name) VALUES (#{name})")
        void insert(@Param("name") String name);
    }

    private Store open(List<String> migrations, String name) {
        return Store.open(dir.resolve(name + ".db"), name, migrations, List.of(NameMapper.class), dir.resolve("backups"));
    }

    @Test
    void d02_applies_pending_migrations_in_order() throws Exception {
        try (Store store = open(AB, "demo")) {
            assertThat(store.<String>read(s -> s.getMapper(NameMapper.class).names())).isEqualTo("a,b");
        }
        assertThat(userVersion(dir.resolve("demo.db"))).isEqualTo(2);
    }

    @Test
    void d02_p08_backs_up_before_migrating_an_existing_database_with_its_name() throws Exception {
        open(A, "tasks").close();
        assertThat(backups()).isEmpty();

        open(AB, "tasks").close();
        assertThat(backups()).singleElement().satisfies(p ->
                assertThat(p.getFileName().toString()).matches("tasks-\\d{8}-\\d{6}-premigracion\\.db"));
        // La copia conserva el estado anterior a la migración.
        assertThat(userVersion(backups().getFirst())).isEqualTo(1);
    }

    @Test
    void d02_p08_keeps_the_last_two_backups_of_each_database_only() throws Exception {
        Files.createDirectories(dir.resolve("backups"));
        for (String old : List.of("tasks-20260101-000000", "tasks-20260102-000000", "tasks-20260103-000000",
                "database-20260101-000000", "tasks-extra-20260101-000000")) {
            Files.writeString(dir.resolve("backups").resolve(old + "-premigracion.db"), "");
        }
        open(A, "tasks").close();
        open(AB, "tasks").close();

        List<String> names = backups().stream().map(p -> p.getFileName().toString()).toList();
        assertThat(names).filteredOn(n -> n.matches("tasks-\\d{8}-\\d{6}-premigracion\\.db")).hasSize(2)
                .doesNotContain("tasks-20260101-000000-premigracion.db", "tasks-20260102-000000-premigracion.db");
        // Las copias de otras bases no se tocan, aunque su nombre empiece igual.
        assertThat(names).contains("database-20260101-000000-premigracion.db", "tasks-extra-20260101-000000-premigracion.db");
    }

    @Test
    void d02_a_failing_migration_rolls_back_and_keeps_the_previous_version() throws Exception {
        open(A, "demo").close();
        assertThatThrownBy(() -> open(List.of("test-migrations/V001__a.sql", "test-migrations/V002__broken.sql"), "demo"))
                .hasMessageContaining("Falló la migración test-migrations/V002__broken.sql");
        assertThat(userVersion(dir.resolve("demo.db"))).isEqualTo(1);
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("demo.db"));
             Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT count(*) FROM t")) {
            rs.next();
            assertThat(rs.getInt(1)).isEqualTo(1);
        }
    }

    @Test
    void d03_refuses_a_database_from_a_newer_version() {
        open(AB, "demo").close();
        assertThatThrownBy(() -> open(A, "demo")).hasMessageContaining("versión más reciente");
    }

    @Test
    void d01_applies_the_pragmas_on_every_connection() {
        try (Store store = open(A, "demo")) {
            assertThat(store.<String>read(s -> pragma(s.getConnection(), "journal_mode"))).isEqualTo("wal");
            assertThat(store.<String>read(s -> pragma(s.getConnection(), "foreign_keys"))).isEqualTo("1");
            assertThat(store.<String>read(s -> pragma(s.getConnection(), "synchronous"))).isEqualTo("1");
            assertThat(store.<String>read(s -> pragma(s.getConnection(), "busy_timeout"))).isEqualTo("5000");
            assertThat(store.<String>write(s -> pragma(s.getConnection(), "foreign_keys"))).isEqualTo("1");
        }
    }

    @Test
    void d06_d07_writes_are_transactions_and_readers_are_read_only() {
        try (Store store = open(A, "demo")) {
            store.write(s -> {
                s.getMapper(NameMapper.class).insert("c");
                return null;
            });
            assertThatThrownBy(() -> store.write(s -> {
                s.getMapper(NameMapper.class).insert("d");
                throw new IllegalStateException("fallo a mitad");
            })).hasMessage("fallo a mitad");
            assertThat(store.<String>read(s -> s.getMapper(NameMapper.class).names())).isEqualTo("a,c");
            assertThatThrownBy(() -> store.read(s -> {
                s.getMapper(NameMapper.class).insert("e");
                return null;
            })).hasMessageContaining("readonly");
        }
    }

    @Test
    void d07_reads_run_in_parallel_with_a_write_in_progress() throws Exception {
        try (Store store = open(A, "demo")) {
            CountDownLatch writing = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            CompletableFuture<Void> writer = CompletableFuture.runAsync(() -> store.write(s -> {
                s.getMapper(NameMapper.class).insert("z");
                writing.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return null;
            }));
            assertThat(writing.await(5, TimeUnit.SECONDS)).isTrue();
            // La lectura no espera a la escritura y no ve lo que aún no se ha confirmado.
            assertThat(CompletableFuture.supplyAsync(() -> store.<String>read(s -> s.getMapper(NameMapper.class).names()))
                    .get(2, TimeUnit.SECONDS)).isEqualTo("a");
            release.countDown();
            writer.get(5, TimeUnit.SECONDS);
            assertThat(store.<String>read(s -> s.getMapper(NameMapper.class).names())).isEqualTo("a,z");
        }
    }

    @Test
    void d02_splits_scripts_into_statements_including_triggers() {
        assertThat(Migrator.split("""
                -- comentario
                CREATE TABLE t (x INTEGER);

                CREATE TRIGGER tr AFTER INSERT ON t BEGIN
                  UPDATE t SET x = 1;
                END;
                INSERT INTO t VALUES (1);
                """)).containsExactly("CREATE TABLE t (x INTEGER)",
                "CREATE TRIGGER tr AFTER INSERT ON t BEGIN\n  UPDATE t SET x = 1;\nEND", "INSERT INTO t VALUES (1)");
    }

    private static String pragma(Connection c, String name) {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("PRAGMA " + name)) {
            rs.next();
            return rs.getString(1);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private List<Path> backups() throws IOException {
        Path b = dir.resolve("backups");
        if (!Files.exists(b)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(b)) {
            return files.sorted().toList();
        }
    }

    private static int userVersion(Path db) throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db);
             Statement st = c.createStatement(); ResultSet rs = st.executeQuery("PRAGMA user_version")) {
            rs.next();
            return rs.getInt(1);
        }
    }
}
