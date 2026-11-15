package dev.cajonsastre.apps.repos;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;

/**
 * git simulado, para probar la mini app sin git ni remotos (ADR-0019). Cada carpeta registrada es un repositorio con un
 * estado que los comandos leen y cambian. Todos los datos son inventados (S-31).
 */
final class FakeGit implements CommandRunner {

    /** El estado de una copia local. */
    static final class Copy {
        /** null: cabecera suelta. */
        volatile String branch = "develop";
        volatile String oid = "1111111111111111111111111111111111111111";
        volatile boolean upstream = true;
        volatile int ahead;
        volatile int behind;
        volatile int changes;
        volatile int untracked;
        final TreeSet<String> local = new TreeSet<>(List.of("develop"));
        final TreeSet<String> remote = new TreeSet<>(List.of("develop", "hotfix"));
        /** null: sin «origin». */
        volatile String origin;
        /** Si no es null, el commit al que lleva el próximo pull; fetch lo anuncia como un commit por detrás. */
        volatile String incoming;
        /** Subcomando → línea de error con la que falla. */
        final Map<String, String> failOn = new ConcurrentHashMap<>();
    }

    /** Todos los comandos recibidos, en orden. */
    final List<Command> commands = new CopyOnWriteArrayList<>();
    final Map<String, Copy> copies = new ConcurrentHashMap<>();
    /** Si es true, git no está instalado. */
    volatile boolean missing;
    /** Si no es null, el subcomando sobre la carpeta con este nombre espera hasta que se libere o se interrumpa. */
    volatile String blocking;
    final CountDownLatch blocked = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);

    /** Los comandos que modifican la copia o contactan con el remoto, sin «git -C carpeta». */
    List<String> actions() {
        return commands.stream().map(FakeGit::sub).filter(a -> !a.startsWith("status ") && !a.startsWith("for-each-ref ")
                && !a.startsWith("remote get-url ")).toList();
    }

    private static String sub(Command command) {
        List<String> args = command.args();
        return String.join(" ", args.get(1).equals("-C") ? args.subList(3, args.size()) : args.subList(1, args.size()));
    }

    @Override
    public int run(Command command, Output output) throws IOException, InterruptedException {
        commands.add(command);
        if (missing) {
            throw new CommandNotFound(command.program(), null);
        }
        List<String> args = command.args();
        if (!args.get(0).equals("git")) {
            throw new IllegalStateException("Comando no previsto: " + args);
        }
        if (args.get(1).equals("clone")) {
            // git clone --branch <rama> -- <url> <carpeta>
            Path dir = Path.of(args.get(6));
            block(dir);
            Files.createDirectories(dir.resolve(".git"));
            Copy copy = new Copy();
            copy.branch = args.get(3);
            copy.local.clear();
            copy.local.add(copy.branch);
            copy.origin = args.get(5);
            copies.put(dir.toString(), copy);
            output.err("Cloning into '" + dir.getFileName() + "'...");
            return 0;
        }
        Copy copy = copies.get(args.get(2));
        if (!args.get(1).equals("-C") || copy == null) {
            output.err("fatal: not a git repository");
            return 128;
        }
        List<String> rest = args.subList(3, args.size());
        String sub = rest.get(0);
        String failure = copy.failOn.get(sub);
        if (failure != null) {
            output.err(failure);
            return 1;
        }
        switch (sub) {
            case "status" -> {
                output.out("# branch.oid " + copy.oid);
                output.out("# branch.head " + (copy.branch == null ? "(detached)" : copy.branch));
                if (copy.branch != null && copy.upstream) {
                    output.out("# branch.upstream origin/" + copy.branch);
                    output.out("# branch.ab +" + copy.ahead + " -" + copy.behind);
                }
                for (int i = 0; i < copy.changes; i++) {
                    output.out("1 .M N... 100644 100644 100644 aaaa bbbb fichero" + i + ".txt");
                }
                for (int i = 0; i < copy.untracked; i++) {
                    output.out("? nuevo" + i + ".txt");
                }
            }
            case "for-each-ref" -> {
                copy.local.forEach(b -> output.out("refs/heads/" + b));
                output.out("refs/remotes/origin/HEAD");
                copy.remote.forEach(b -> output.out("refs/remotes/origin/" + b));
            }
            case "remote" -> {
                if (rest.get(1).equals("get-url")) {
                    if (copy.origin == null) {
                        output.err("error: No such remote 'origin'");
                        return 2;
                    }
                    output.out(copy.origin);
                } else {
                    copy.origin = rest.get(3);
                }
            }
            case "fetch" -> {
                block(Path.of(args.get(2)));
                if (copy.incoming != null) {
                    copy.behind = 1;
                }
            }
            case "pull" -> {
                block(Path.of(args.get(2)));
                if (copy.incoming != null) {
                    copy.oid = copy.incoming;
                    copy.incoming = null;
                    copy.behind = 0;
                    output.out("Updating 1111111..2222222");
                } else {
                    output.out("Already up to date.");
                }
            }
            case "switch" -> {
                String branch = rest.get(1);
                if (!copy.local.contains(branch) && !copy.remote.contains(branch)) {
                    output.err("fatal: invalid reference: " + branch);
                    return 128;
                }
                copy.branch = branch;
                copy.local.add(branch);
            }
            case "reset" -> copy.changes = 0;
            default -> throw new IllegalStateException("Comando de git no previsto: " + args);
        }
        return 0;
    }

    private void block(Path dir) throws InterruptedException {
        if (dir.getFileName().toString().equals(blocking)) {
            blocked.countDown();
            release.await();
        }
    }
}
