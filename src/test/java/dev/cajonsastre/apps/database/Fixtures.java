package dev.cajonsastre.apps.database;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Datos inventados y ayudas comunes a las pruebas de la mini app (S-31). */
final class Fixtures {

    static final ZoneOffset ZONE = ZoneOffset.UTC;
    static final String BUCKET = "bucket-de-prueba";
    static final String PASSWORD = "clave-secreta-de-prueba";
    static final Instant MONDAY = Instant.parse("2026-11-02T08:00:00Z");
    static final Instant TUESDAY = Instant.parse("2026-11-03T08:30:00Z");
    static final Instant WEDNESDAY = Instant.parse("2026-11-04T09:15:00Z");

    private Fixtures() {
    }

    /** Una configuración completa sobre una carpeta temporal, con sus carpetas y scripts iniciales creados. */
    static DatabaseConfig config(Path dir) throws IOException {
        Path work = Files.createDirectories(dir.resolve("trabajo"));
        Path pending = Files.createDirectories(dir.resolve("sql/pendientes"));
        Path versions = Files.createDirectories(dir.resolve("sql/versiones"));
        Path init = dir.resolve("sql/inicial.sql");
        Path second = dir.resolve("sql/segundo.sql");
        Files.writeString(init, "CREATE USER demo;");
        Files.writeString(second, "RENAME demo;");
        return new DatabaseConfig(work.toString(), "s3://" + BUCKET + "/volcados", "_remoto.tar.gz", "_local.tar.gz",
                "mysql-de-prueba", "mysql:8.4", PASSWORD, 3307, 3306, "Europe/Madrid", init.toString(), second.toString(),
                "demo", pending.toString(), versions.toString());
    }

    static String s3Key(Branch branch) {
        return BUCKET + "/volcados/BBDD_" + branch.id() + "_remoto.tar.gz";
    }

    static Path write(Path file, String content, Instant modified) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
        Files.setLastModifiedTime(file, FileTime.from(modified));
        return file;
    }

    /** Un Reporter que lo guarda todo. */
    static final class Recorder implements Reporter {
        final List<String> log = new CopyOnWriteArrayList<>();
        final List<String> messages = new CopyOnWriteArrayList<>();
        final List<String> progress = new CopyOnWriteArrayList<>();

        @Override
        public void log(String line) {
            log.add(line);
        }

        @Override
        public void message(String text) {
            messages.add(text);
        }

        @Override
        public void progress(long done, long total) {
            progress.add(done + "/" + total);
        }
    }

    /** Un Sleeper que no espera y apunta lo que se le pidió. */
    static final class NoSleep implements Sleeper {
        final List<Duration> sleeps = new CopyOnWriteArrayList<>();

        @Override
        public void sleep(Duration time) {
            sleeps.add(time);
        }
    }
}
