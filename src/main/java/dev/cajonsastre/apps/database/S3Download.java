package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.apps.database.DumpLibrary.PartMeta;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * BD-20 a BD-29: descarga de S3 con el comando aws del usuario. Solo lee: head-object, get-object y s3 cp de S3 a
 * local. No pide, lee ni guarda credenciales (ADR-0011).
 */
final class S3Download {

    /** BD-23 */
    static final long CHUNK_BYTES = 100L * 1024 * 1024;
    static final int MAX_ATTEMPTS = 10;
    static final Duration RETRY_WAIT = Duration.ofSeconds(10);
    /** BD-28 */
    static final List<String> EXTRA_FILES = List.of("dynamodb/Dockerfile", "dynamodb/dynamo-db-dump.tar.bz2");
    private static final ObjectMapper JSON = new ObjectMapper();

    /** BD-22: lo que dice S3 del objeto. */
    record RemoteObject(long size, Instant modified, String etag) {
    }

    private final CommandRunner runner;
    private final DatabaseConfig config;
    private final DumpLibrary library;
    private final Reporter reporter;
    private final Sleeper sleeper;
    private final long chunkBytes;

    S3Download(CommandRunner runner, DatabaseConfig config, DumpLibrary library, Reporter reporter, Sleeper sleeper) {
        this(runner, config, library, reporter, sleeper, CHUNK_BYTES);
    }

    S3Download(CommandRunner runner, DatabaseConfig config, DumpLibrary library, Reporter reporter, Sleeper sleeper,
               long chunkBytes) {
        this.runner = runner;
        this.config = config;
        this.library = library;
        this.reporter = reporter;
        this.sleeper = sleeper;
        this.chunkBytes = chunkBytes;
    }

    /**
     * BD-29: todas las descargas del paso. Se intentan todas aunque una falle; si falló alguna, lanza con el resumen.
     *
     * @param chunked BD-23 o BD-26
     * @param force   BD-22: descargar aunque el volcado no haya cambiado
     */
    void run(List<Branch> branches, boolean chunked, boolean force) throws StepFailed, InterruptedException {
        List<String> failures = new ArrayList<>();
        for (Branch branch : branches) {
            try {
                dump(branch, chunked, force);
            } catch (StepFailed | IOException e) {
                failures.add(fail("volcado de " + branch.id(), e));
            }
        }
        for (String file : EXTRA_FILES) {
            try {
                extra(file);
            } catch (StepFailed | IOException e) {
                failures.add(fail(file, e));
            }
        }
        reporter.progress(0, 0);
        if (!failures.isEmpty()) {
            throw new StepFailed("No se pudo descargar: " + String.join("; ", failures));
        }
        reporter.message("Descarga terminada");
    }

    private String fail(String what, Exception e) {
        String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        reporter.log("ERROR en " + what + ": " + reason);
        return what + " (" + reason + ")";
    }

    // --- Volcados ---

    private void dump(Branch branch, boolean chunked, boolean force) throws StepFailed, IOException, InterruptedException {
        String key = config.key(config.s3DumpName(branch));
        Path current = library.current(branch);
        Files.createDirectories(library.workDir());
        reporter.progress(0, 0);
        reporter.message("Consultando el volcado de " + branch.id());
        RemoteObject remote = head(key);

        // BD-22: mismo tamaño y misma fecha que el actual: es el mismo volcado.
        boolean existed = Files.isRegularFile(current);
        boolean same = existed && Files.size(current) == remote.size()
                && Files.getLastModifiedTime(current).toInstant().getEpochSecond() == remote.modified().getEpochSecond();
        if (same && !force) {
            reporter.log("Ya tienes el último volcado de " + branch.id() + ": no se descarga");
            return;
        }
        Path part = library.part(branch);
        if (chunked) {
            chunked(branch, key, remote, part);
        } else {
            direct(branch, key, remote, part);
        }
        // BD-25
        long size = Files.size(part);
        if (size != remote.size()) {
            throw new StepFailed("el tamaño final no coincide: " + size + " de " + remote.size() + " bytes");
        }
        Files.setLastModifiedTime(part, FileTime.from(remote.modified()));
        library.install(branch, part, !same);
        Files.deleteIfExists(library.partMetaFile(branch));
        reporter.log(!existed ? "Volcado de " + branch.id() + " descargado"
                : same ? "Volcado de " + branch.id() + " descargado de nuevo; no se rota porque no ha cambiado"
                : "Volcado de " + branch.id() + " actualizado; el que había queda como copia anterior");
    }

    /** BD-22 */
    private RemoteObject head(String key) throws StepFailed, IOException, InterruptedException {
        StringBuilder stdout = new StringBuilder();
        int code = reporter.capture(runner, Command.of("aws", "s3api", "head-object", "--bucket", config.bucket(), "--key",
                key, "--output", "json"), stdout);
        if (code != 0) {
            throw new StepFailed("no se pudo consultar el objeto en S3 (código " + code + ")");
        }
        try {
            JsonNode node = JSON.readTree(stdout.toString());
            JsonNode size = node.get("ContentLength");
            JsonNode modified = node.get("LastModified");
            JsonNode etag = node.get("ETag");
            if (size == null || !size.canConvertToLong() || modified == null || etag == null || etag.asText().isBlank()) {
                throw new StepFailed("la respuesta de S3 no trae tamaño, fecha y ETag");
            }
            return new RemoteObject(size.asLong(), instant(modified.asText()), etag.asText());
        } catch (IOException | DateTimeParseException e) {
            throw new StepFailed("no se pudo interpretar la respuesta de S3");
        }
    }

    /** La CLI da la fecha en ISO 8601; las versiones antiguas, en el formato de las cabeceras HTTP. */
    static Instant instant(String text) {
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            return ZonedDateTime.parse(text, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
        }
    }

    /** BD-23, BD-24 */
    private void chunked(Branch branch, String key, RemoteObject remote, Path part) throws StepFailed, IOException, InterruptedException {
        Path chunk = library.partChunk(branch);
        long done = 0;
        if (Files.isRegularFile(part)) {
            PartMeta meta = library.readPartMeta(branch);
            long size = Files.size(part);
            if (meta != null && meta.etag().equals(remote.etag()) && meta.size() == remote.size() && size <= remote.size()) {
                done = size;
                reporter.log("Se reanuda la descarga a medias: " + done + " de " + remote.size() + " bytes");
            } else {
                reporter.log("La descarga a medias no es de este volcado: se descarta y se empieza de cero");
                Files.delete(part);
            }
        }
        library.writePartMeta(branch, new PartMeta(remote.etag(), remote.size()));
        long total = remote.size();
        reporter.progress(done, total);
        while (done < total) {
            long start = done;
            long end = Math.min(start + chunkBytes, total) - 1;
            long expected = end - start + 1;
            long number = start / chunkBytes + 1;
            long count = (total + chunkBytes - 1) / chunkBytes;
            reporter.message("Volcado de " + branch.id() + ": bloque " + number + " de " + count);
            boolean ok = false;
            for (int attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
                Files.deleteIfExists(chunk);
                int code = reporter.capture(runner, Command.of("aws", "s3api", "get-object", "--bucket", config.bucket(),
                        "--key", key, "--range", "bytes=" + start + "-" + end, "--if-match", remote.etag(),
                        chunk.toString()), new StringBuilder());
                long received = Files.isRegularFile(chunk) ? Files.size(chunk) : -1;
                if (code == 0 && received == expected) {
                    append(chunk, part);
                    ok = true;
                } else {
                    reporter.log(code != 0 ? "ERROR descargando el bloque (código " + code + "), intento " + attempt + " de " + MAX_ATTEMPTS
                            : "ERROR: el bloque mide " + received + " bytes y se esperaban " + expected + ", intento " + attempt
                            + " de " + MAX_ATTEMPTS);
                    if (attempt < MAX_ATTEMPTS) {
                        sleeper.sleep(RETRY_WAIT);
                    }
                }
            }
            Files.deleteIfExists(chunk);
            if (!ok) {
                throw new StepFailed("no se pudo descargar el bloque " + number + " de " + count
                        + "; lo ya descargado se conserva y se reanudará la próxima vez");
            }
            done = Files.size(part);
            reporter.progress(done, total);
        }
    }

    private static void append(Path chunk, Path part) throws IOException {
        try (FileChannel in = FileChannel.open(chunk, StandardOpenOption.READ);
             FileChannel out = FileChannel.open(part, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND)) {
            long size = in.size();
            long position = 0;
            while (position < size) {
                position += in.transferTo(position, size - position, out);
            }
        }
    }

    /** BD-26: una sola llamada, sin reanudación. El progreso es el que va diciendo la propia CLI. */
    private void direct(Branch branch, String key, RemoteObject remote, Path part) throws StepFailed, IOException, InterruptedException {
        Files.deleteIfExists(part);
        Files.deleteIfExists(library.partMetaFile(branch));
        reporter.message("Volcado de " + branch.id() + ": descarga directa de " + remote.size() + " bytes");
        int code = reporter.run(runner, Command.of("aws", "s3", "cp", "s3://" + config.bucket() + "/" + key, part.toString()));
        if (code != 0 || !Files.isRegularFile(part)) {
            Files.deleteIfExists(part);
            throw new StepFailed("la descarga directa falló (código " + code + ")");
        }
    }

    // --- Ficheros de dynamodb/ (BD-28) ---

    private void extra(String name) throws StepFailed, IOException, InterruptedException {
        Path target = library.workDir().resolve(name);
        Files.createDirectories(target.getParent());
        Path part = target.resolveSibling(target.getFileName() + ".part");
        Files.deleteIfExists(part);
        reporter.message("Descargando " + name);
        int code = reporter.run(runner, Command.of("aws", "s3", "cp", config.s3Url(name), part.toString()));
        if (code != 0 || !Files.isRegularFile(part)) {
            Files.deleteIfExists(part);
            throw new StepFailed("código " + code);
        }
        Files.move(part, target, StandardCopyOption.REPLACE_EXISTING);
    }
}
