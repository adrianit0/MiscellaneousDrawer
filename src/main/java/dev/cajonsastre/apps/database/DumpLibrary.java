package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * BD-30 a BD-37: el volcado actual de cada rama y sus copias. Todo son ficheros con un nombre que lo dice todo; no hay
 * base de datos (ADR-0011).
 *
 * <pre>
 * &lt;carpeta&gt;/BBDD_&lt;rama&gt;&lt;sufijo&gt;                               volcado actual
 * &lt;carpeta&gt;/backups/&lt;rama&gt;/auto-&lt;AAAAMMDD-HHmmss&gt;.tar.gz          copia anterior
 * &lt;carpeta&gt;/backups/&lt;rama&gt;/kept-&lt;AAAAMMDD-HHmmss&gt;-&lt;nombre&gt;.tar.gz copia conservada
 * </pre>
 */
final class DumpLibrary {

    static final String PREFIX = "BBDD_";
    /** BD-40: el volcado actual en la API. */
    static final String CURRENT = "current";
    private static final String EXTENSION = ".tar.gz";
    private static final Pattern AUTO = Pattern.compile("auto-(\\d{8}-\\d{6})\\.tar\\.gz");
    private static final Pattern KEPT = Pattern.compile("kept-(\\d{8}-\\d{6})-(.{1,40})\\.tar\\.gz");
    /** BD-33 */
    private static final Pattern NAME = Pattern.compile("[\\p{L}\\p{N}]([\\p{L}\\p{N} _.-]{0,38}[\\p{L}\\p{N}])?");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss", Locale.ROOT);
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * @param kind     current, previous o kept
     * @param file     nombre del fichero: lo que identifica a una copia en la API
     * @param name     nombre que le dio el usuario; solo en las conservadas
     * @param modified fecha del volcado, en ISO 8601
     */
    record Dump(String kind, String file, String name, long size, String modified) {
    }

    /** BD-24: lo que se sabe del objeto que se estaba descargando. */
    record PartMeta(String etag, long size) {
    }

    /** BD-35: una descarga a medias; total null si no se sabe. */
    record Partial(long done, Long total) {
    }

    record BranchDumps(String branch, Dump current, Dump previous, List<Dump> kept, Partial partial) {
    }

    private final Path workDir;
    private final String localSuffix;
    private final ZoneId zone;

    DumpLibrary(Path workDir, String localSuffix, ZoneId zone) {
        this.workDir = workDir;
        this.localSuffix = localSuffix;
        this.zone = zone;
    }

    static DumpLibrary of(DatabaseConfig config, ZoneId zone) {
        return new DumpLibrary(Path.of(config.workDir()), config.localSuffix(), zone);
    }

    Path workDir() {
        return workDir;
    }

    /** BD-21 */
    Path current(Branch branch) {
        return workDir.resolve(PREFIX + branch.id() + localSuffix);
    }

    Path part(Branch branch) {
        return sibling(branch, ".part");
    }

    Path partMetaFile(Branch branch) {
        return sibling(branch, ".part.json");
    }

    Path partChunk(Branch branch) {
        return sibling(branch, ".part.chunk");
    }

    private Path sibling(Branch branch, String extension) {
        Path current = current(branch);
        return current.resolveSibling(current.getFileName() + extension);
    }

    Path backups(Branch branch) {
        return workDir.resolve("backups").resolve(branch.id());
    }

    // --- Consulta (BD-35) ---

    BranchDumps list(Branch branch) throws IOException {
        Path current = current(branch);
        Dump now = Files.isRegularFile(current) ? dump(CURRENT, current, null) : null;
        List<Dump> autos = new ArrayList<>();
        List<Dump> kept = new ArrayList<>();
        for (Path file : backupFiles(branch)) {
            String name = file.getFileName().toString();
            Matcher k = KEPT.matcher(name);
            if (AUTO.matcher(name).matches()) {
                autos.add(dump("previous", file, null));
            } else if (k.matches() && NAME.matcher(k.group(2)).matches()) {
                kept.add(dump("kept", file, k.group(2)));
            }
        }
        // El nombre empieza por la fecha: el orden inverso por nombre es de la más reciente a la más antigua.
        Comparator<Dump> newestFirst = Comparator.comparing(Dump::file).reversed();
        autos.sort(newestFirst);
        kept.sort(newestFirst);
        return new BranchDumps(branch.id(), now, autos.isEmpty() ? null : autos.get(0), kept, partial(branch));
    }

    private List<Path> backupFiles(Branch branch) throws IOException {
        Path dir = backups(branch);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(Files::isRegularFile).toList();
        }
    }

    private static Dump dump(String kind, Path file, String name) throws IOException {
        return new Dump(kind, file.getFileName().toString(), name, Files.size(file),
                Files.getLastModifiedTime(file).toInstant().truncatedTo(ChronoUnit.SECONDS).toString());
    }

    private Partial partial(Branch branch) throws IOException {
        Path part = part(branch);
        if (!Files.isRegularFile(part)) {
            return null;
        }
        PartMeta meta = readPartMeta(branch);
        return new Partial(Files.size(part), meta == null ? null : meta.size());
    }

    PartMeta readPartMeta(Branch branch) {
        Path file = partMetaFile(branch);
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            PartMeta meta = JSON.readValue(file.toFile(), PartMeta.class);
            return meta.etag() == null ? null : meta;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    void writePartMeta(Branch branch, PartMeta meta) throws IOException {
        JSON.writeValue(partMetaFile(branch).toFile(), meta);
    }

    /**
     * BD-37, BD-40: el fichero de un volcado de la rama a partir de lo que llega por la API: «current» o el nombre de
     * una copia. Nunca se usa una ruta recibida.
     */
    Path resolve(Branch branch, String ref) {
        if (CURRENT.equals(ref)) {
            return current(branch);
        }
        requireBackupName(ref);
        return backups(branch).resolve(ref);
    }

    /** BD-37: 400 si no es el nombre de una copia. */
    static void requireBackupName(String file) {
        if (file == null || !(AUTO.matcher(file).matches() || keptName(file) != null)) {
            throw ApiError.badRequest("invalid_request", "No es el nombre de una copia: " + file);
        }
    }

    private static String keptName(String file) {
        Matcher k = KEPT.matcher(file);
        return k.matches() && NAME.matcher(k.group(2)).matches() ? k.group(2) : null;
    }

    // --- Cambios ---

    /**
     * BD-25, BD-31: part pasa a ser el volcado actual. Con rotate, el que había pasa a ser la copia anterior y la
     * anterior que hubiera se borra al final, cuando el nuevo ya está en su sitio.
     */
    void install(Branch branch, Path part, boolean rotate) throws IOException {
        Path current = current(branch);
        Path previous = null;
        if (rotate && Files.isRegularFile(current)) {
            Path dir = Files.createDirectories(backups(branch));
            previous = dir.resolve("auto-" + stamp(current) + EXTENSION);
            Files.move(current, previous, StandardCopyOption.REPLACE_EXISTING);
        }
        try {
            Files.move(part, current, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            if (previous != null) {
                // El que había vuelve a su sitio.
                Files.move(previous, current);
            }
            throw e;
        }
        if (previous != null) {
            for (Path file : backupFiles(branch)) {
                if (AUTO.matcher(file.getFileName().toString()).matches() && !file.equals(previous)) {
                    Files.deleteIfExists(file);
                }
            }
        }
    }

    /** BD-32, BD-33: una copia conservada del volcado actual o de la copia anterior, como enlace duro. */
    Dump keep(Branch branch, String source, String name) throws IOException {
        String label = name == null ? "" : name.strip();
        if (!NAME.matcher(label).matches()) {
            throw ApiError.badRequest("invalid_name",
                    "El nombre debe tener de 1 a 40 caracteres: letras, cifras, espacios, - _ y ., y empezar y acabar por letra o cifra");
        }
        if (!CURRENT.equals(source) && (source == null || !AUTO.matcher(source).matches())) {
            throw ApiError.badRequest("invalid_request", "Solo se puede conservar el volcado actual o la copia anterior");
        }
        Path from = resolve(branch, source);
        if (!Files.isRegularFile(from)) {
            throw ApiError.notFound("dump_not_found", "Ese volcado ya no existe");
        }
        for (Path file : backupFiles(branch)) {
            String taken = keptName(file.getFileName().toString());
            if (taken != null && taken.equalsIgnoreCase(label)) {
                throw new ApiError(409, "name_taken", "Ya hay una copia de " + branch.id() + " con el nombre «" + taken + "»");
            }
        }
        Path dir = Files.createDirectories(backups(branch));
        Path target = dir.resolve("kept-" + stamp(from) + "-" + label + EXTENSION);
        try {
            Files.createLink(target, from);
        } catch (UnsupportedOperationException | IOException e) {
            throw new ApiError(409, "links_unsupported",
                    "No se pudo conservar la copia: el sistema de ficheros de la carpeta de trabajo no admite enlaces duros");
        }
        return dump("kept", target, label);
    }

    /** BD-34: borra la copia anterior o una conservada. El volcado actual no se borra desde aquí. */
    void delete(Branch branch, String file) throws IOException {
        requireBackupName(file);
        Path path = backups(branch).resolve(file);
        if (!Files.isRegularFile(path)) {
            throw ApiError.notFound("dump_not_found", "Esa copia ya no existe");
        }
        Files.delete(path);
    }

    /** BD-30: la fecha del volcado en la hora local. */
    private String stamp(Path file) throws IOException {
        Instant modified = Files.getLastModifiedTime(file).toInstant();
        return STAMP.format(modified.atZone(zone));
    }
}
