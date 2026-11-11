package dev.cajonsastre.apps.database;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;

/**
 * aws y docker simulados, para probar las secuencias completas sin tenerlos instalados (ADR-0011). S3 es un mapa en
 * memoria y el contenedor, la lista de lo que recibió mysql. Todos los datos son inventados (S-31).
 */
final class FakeCommands implements CommandRunner {

    record S3Object(byte[] bytes, String etag, Instant modified) {
    }

    /** Todos los comandos recibidos, en orden. */
    final List<Command> commands = new CopyOnWriteArrayList<>();
    /** «bucket/clave» → objeto. */
    final Map<String, S3Object> objects = new ConcurrentHashMap<>();
    /** Lo que recibió mysql: «base: contenido», con «-» si no se indicó base. */
    final List<String> executedSql = new CopyOnWriteArrayList<>();
    /** Programas que no están instalados (BD-19). */
    final Set<String> missing = ConcurrentHashMap.newKeySet();
    /** get-object que fallan antes de volver a funcionar. */
    final AtomicInteger failingChunks = new AtomicInteger();
    /** get-object que entregan un byte de menos antes de volver a funcionar. */
    final AtomicInteger shortChunks = new AtomicInteger();
    /** Comandos que terminan con código 1. */
    volatile Predicate<Command> failing = c -> false;
    /** Si no es null, un comando que lo cumpla espera en hold hasta que se libere o se interrumpa. */
    volatile Predicate<Command> blocking;
    final CountDownLatch blocked = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);

    void put(String bucketAndKey, String content, Instant modified) {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        try {
            String md5 = HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(bytes));
            objects.put(bucketAndKey, new S3Object(bytes, "\"" + md5 + "\"", modified));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Las líneas de comando recibidas de un programa, como en el registro. */
    List<String> lines(String program) {
        return commands.stream().filter(c -> c.program().equals(program)).map(Command::line).toList();
    }

    @Override
    public int run(Command command, Output output) throws IOException, InterruptedException {
        commands.add(command);
        if (missing.contains(command.program())) {
            throw new CommandNotFound(command.program(), null);
        }
        Predicate<Command> hold = blocking;
        if (hold != null && hold.test(command)) {
            blocked.countDown();
            release.await();
        }
        if (failing.test(command)) {
            output.err("Error simulado");
            return 1;
        }
        return switch (command.program()) {
            case "aws" -> aws(command.args(), output);
            case "docker" -> docker(command, output);
            default -> 0;
        };
    }

    private int aws(List<String> args, Output output) throws IOException {
        String action = args.get(1) + " " + args.get(2);
        switch (action) {
            case "s3api head-object" -> {
                S3Object object = objects.get(option(args, "--bucket") + "/" + option(args, "--key"));
                if (object == null) {
                    output.err("An error occurred (404) when calling the HeadObject operation: Not Found");
                    return 254;
                }
                output.out("{");
                output.out("    \"AcceptRanges\": \"bytes\",");
                output.out("    \"LastModified\": \"" + object.modified().toString().replace("Z", "+00:00") + "\",");
                output.out("    \"ContentLength\": " + object.bytes().length + ",");
                output.out("    \"ETag\": \"" + object.etag().replace("\"", "\\\"") + "\"");
                output.out("}");
                return 0;
            }
            case "s3api get-object" -> {
                S3Object object = objects.get(option(args, "--bucket") + "/" + option(args, "--key"));
                if (object == null || !object.etag().equals(option(args, "--if-match"))) {
                    output.err("An error occurred (PreconditionFailed) when calling the GetObject operation");
                    return 254;
                }
                if (failingChunks.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
                    output.err("Connection was closed before we received a valid response");
                    return 1;
                }
                String[] range = option(args, "--range").substring("bytes=".length()).split("-");
                int start = Integer.parseInt(range[0]);
                int end = Integer.parseInt(range[1]) + 1;
                if (shortChunks.getAndUpdate(n -> Math.max(0, n - 1)) > 0) {
                    end--;
                }
                Files.write(Path.of(args.get(args.size() - 1)), Arrays.copyOfRange(object.bytes(), start, end));
                output.out("{}");
                return 0;
            }
            case "s3 cp" -> {
                String source = args.get(3);
                S3Object object = objects.get(source.substring("s3://".length()));
                if (object == null) {
                    output.err("fatal error: An error occurred (404) when calling the HeadObject operation: Key does not exist");
                    return 1;
                }
                output.progress("Completed 1 Bytes/" + object.bytes().length + " Bytes with 1 file(s) remaining");
                Files.write(Path.of(args.get(4)), object.bytes());
                output.out("download: " + source + " to " + args.get(4));
                return 0;
            }
            default -> throw new IllegalStateException("Comando de aws no previsto: " + args);
        }
    }

    private int docker(Command command, Output output) throws IOException {
        List<String> args = command.args();
        if (args.get(1).equals("exec")) {
            // docker exec -i -e MYSQL_PWD <contenedor> mysql --default-character-set=utf8 -uroot [base]
            String sql = Files.readString(command.stdin()).strip();
            executedSql.add((args.size() > 9 ? args.get(9) : "-") + ": " + sql);
            if (sql.contains("FALLA")) {
                output.err("ERROR 1064 (42000) at line 1: You have an error in your SQL syntax");
                return 1;
            }
            return 0;
        }
        output.out(args.get(1).equals("run") && args.contains("-d") ? "0123456789ab" : String.join(" ", args.subList(1, args.size())));
        return 0;
    }

    private static String option(List<String> args, String name) {
        int i = args.indexOf(name);
        if (i < 0) {
            throw new IllegalStateException("Falta " + name + " en " + args);
        }
        return args.get(i + 1);
    }
}
