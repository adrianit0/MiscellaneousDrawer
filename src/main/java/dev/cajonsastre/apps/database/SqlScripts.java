package dev.cajonsastre.apps.database;

import dev.cajonsastre.platform.ApiError;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** BD-50 a BD-54: las carpetas de scripts SQL y su ejecución en el contenedor. */
final class SqlScripts {

    /** BD-52: líneas de la salida de error que se guardan de un script que falla. */
    static final int ERROR_LINES = 20;
    private static final Pattern PIECE = Pattern.compile("\\d+|\\D+");

    /** @param version null: «Pendientes» */
    record Listing(List<String> versions, String version, String folder, boolean exists, List<String> files) {
    }

    /** BD-52: state es pending, running, ok o error. */
    record Result(String file, String state, String error) {
    }

    /** Recibe el resultado de cada script según cambia. */
    @FunctionalInterface
    interface Progress {
        void update(int index, Result result);
    }

    private final DatabaseConfig config;

    SqlScripts(DatabaseConfig config) {
        this.config = config;
    }

    /** BD-50: las versiones, de la más alta a la más baja. Sin carpeta de versiones, ninguna. */
    List<String> versions() throws IOException {
        if (config.versionsSqlDir() == null) {
            return List.of();
        }
        Path dir = Path.of(config.versionsSqlDir());
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(dir)) {
            return children.filter(Files::isDirectory).map(p -> p.getFileName().toString())
                    .sorted(SqlScripts::compareVersions).toList().reversed();
        }
    }

    /** BD-50, BD-53: la carpeta de «Pendientes» o de una versión, que debe ser una subcarpeta directa. */
    Path folder(String version) {
        if (version == null) {
            return Path.of(config.pendingSqlDir());
        }
        requireSimpleName(version, "versión");
        if (config.versionsSqlDir() == null) {
            throw new ApiError(409, "not_configured", "Falta configurar: " + DatabaseConfig.label("versionsSqlDir"));
        }
        Path folder = Path.of(config.versionsSqlDir()).resolve(version);
        if (!Files.isDirectory(folder)) {
            throw ApiError.badRequest("invalid_request", "La versión «" + version + "» no existe");
        }
        return folder;
    }

    /** BD-50: los .sql de una carpeta, por orden de nombre. */
    static List<String> files(Path folder) throws IOException {
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(folder)) {
            return children.filter(Files::isRegularFile).map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith(".sql")).sorted().toList();
        }
    }

    Listing listing(String version) throws IOException {
        Path folder = folder(version);
        return new Listing(versions(), version, folder.toString(), Files.isDirectory(folder), files(folder));
    }

    /** BD-51, BD-53: los ficheros pedidos, o todos; en orden de nombre y comprobados contra la carpeta. */
    List<String> select(Path folder, List<String> wanted) throws IOException {
        List<String> all = files(folder);
        if (wanted == null) {
            return all;
        }
        for (String name : wanted) {
            requireSimpleName(name, "fichero");
            if (!all.contains(name)) {
                throw ApiError.badRequest("invalid_request", "El script «" + name + "» no existe en " + folder);
            }
        }
        return all.stream().filter(wanted::contains).toList();
    }

    /** BD-51, BD-52: ejecuta los scripts; uno que falla no detiene los demás. Devuelve cuántos fallaron. */
    int run(CommandRunner runner, Reporter reporter, Path folder, List<String> files, Progress progress)
            throws IOException, InterruptedException {
        int failed = 0;
        for (int i = 0; i < files.size(); i++) {
            String file = files.get(i);
            progress.update(i, new Result(file, "running", null));
            reporter.message("Script " + (i + 1) + " de " + files.size() + ": " + file);
            List<String> errors = new ArrayList<>();
            int code = reporter.runKeepingErrors(runner,
                    DockerImport.mysql(config, config.databaseName()).withStdin(folder.resolve(file)), ERROR_LINES, errors);
            if (code == 0) {
                progress.update(i, new Result(file, "ok", null));
            } else {
                failed++;
                String error = errors.isEmpty() ? "Código de salida " + code : String.join("\n", errors);
                reporter.log("ERROR al ejecutar " + file + "; se sigue con el siguiente");
                progress.update(i, new Result(file, "error", error));
            }
        }
        return failed;
    }

    /** BD-53: un nombre simple, que no puede salir de su carpeta. */
    static void requireSimpleName(String name, String what) {
        if (name == null || name.isBlank() || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..")
                || name.chars().anyMatch(Character::isISOControl)) {
            throw ApiError.badRequest("invalid_request", "Nombre de " + what + " no válido");
        }
    }

    /** BD-50: compara los números como números: 12.6.10 va después de 12.6.9. */
    static int compareVersions(String a, String b) {
        Matcher ma = PIECE.matcher(a);
        Matcher mb = PIECE.matcher(b);
        while (true) {
            boolean ha = ma.find();
            boolean hb = mb.find();
            if (!ha || !hb) {
                return Boolean.compare(ha, hb);
            }
            String pa = ma.group();
            String pb = mb.group();
            boolean digits = Character.isDigit(pa.charAt(0)) && Character.isDigit(pb.charAt(0));
            int order = digits ? new BigInteger(pa).compareTo(new BigInteger(pb)) : pa.compareTo(pb);
            if (order != 0) {
                return order;
            }
        }
    }
}
