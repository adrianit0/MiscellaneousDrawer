package dev.cajonsastre.apps.repos;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;
import java.util.stream.Stream;

/** RG-10 a RG-15: el estado local de un repositorio. Solo ejecuta comandos que no contactan con el remoto ni modifican nada. */
final class RepoInspector {

    /** RG-11: lo que hay en la carpeta, sin ejecutar nada. */
    enum Folder { MISSING, NOT_GIT, GIT }

    /** RG-12. branch null: cabecera suelta. ahead y behind null: sin rama remota. */
    record Local(String branch, String oid, int changes, int untracked, Integer ahead, Integer behind) {
    }

    /** RG-11 a RG-14: lo que ve la interfaz. */
    record StatusView(int id, String state, String branch, String head, Integer changes, Integer untracked, Integer ahead,
                      Integer behind, List<String> branches, Boolean remoteMatches, String error) {

        static StatusView of(int id, String state, String error) {
            return new StatusView(id, state, null, null, null, null, null, null, List.of(), null, error);
        }
    }

    /** RG-10, RG-15 */
    record Statuses(List<StatusView> statuses, String warning) {
    }

    /** git ha terminado con error. El mensaje es su última línea de error. */
    static final class GitFailed extends Exception {
        GitFailed(String message) {
            super(message);
        }
    }

    private record Result(int code, List<String> out, String lastError) {
    }

    private final CommandRunner runner;

    RepoInspector(CommandRunner runner) {
        this.runner = runner;
    }

    /** RG-11 */
    static Folder folder(Repo repo) throws IOException {
        Path dir = Path.of(repo.dir());
        if (!Files.exists(dir)) {
            return Folder.MISSING;
        }
        if (!Files.isDirectory(dir)) {
            return Folder.NOT_GIT;
        }
        if (Files.exists(dir.resolve(".git"))) {
            return Folder.GIT;
        }
        try (Stream<Path> children = Files.list(dir)) {
            return children.findAny().isPresent() ? Folder.NOT_GIT : Folder.MISSING;
        }
    }

    /** RG-10 */
    Statuses all(List<Repo> repos) throws InterruptedException {
        List<StatusView> statuses = new ArrayList<>();
        String warning = null;
        for (Repo repo : repos) {
            if (warning != null) {
                statuses.add(StatusView.of(repo.id(), "error", warning));
                continue;
            }
            try {
                statuses.add(inspect(repo));
            } catch (CommandRunner.CommandNotFound e) {
                // RG-15
                warning = e.getMessage();
                statuses.replaceAll(s -> StatusView.of(s.id(), "error", e.getMessage()));
                statuses.add(StatusView.of(repo.id(), "error", warning));
            } catch (IOException e) {
                statuses.add(StatusView.of(repo.id(), "error", "No se ha podido leer la carpeta"));
            }
        }
        return new Statuses(statuses, warning);
    }

    /** RG-11 a RG-14 */
    StatusView inspect(Repo repo) throws IOException, InterruptedException {
        Folder folder = folder(repo);
        if (folder != Folder.GIT) {
            return StatusView.of(repo.id(), folder == Folder.MISSING ? "missing" : "not_git", null);
        }
        try {
            Local local = local(repo);
            String oid = local.oid();
            return new StatusView(repo.id(), "ok", local.branch(), oid == null ? null : oid.substring(0, Math.min(8, oid.length())),
                    local.changes(), local.untracked(), local.ahead(), local.behind(), branches(repo), remoteMatches(repo), null);
        } catch (GitFailed e) {
            return StatusView.of(repo.id(), "error", e.getMessage());
        }
    }

    /** RG-12 */
    Local local(Repo repo) throws IOException, InterruptedException, GitFailed {
        Result result = ok(Command.gitIn(repo.dir(), "status", "--porcelain=v2", "--branch"));
        String branch = null;
        String oid = null;
        Integer ahead = null;
        Integer behind = null;
        int changes = 0;
        int untracked = 0;
        for (String line : result.out()) {
            if (line.startsWith("# branch.oid ")) {
                String value = line.substring(13).strip();
                oid = value.startsWith("(") ? null : value;
            } else if (line.startsWith("# branch.head ")) {
                String value = line.substring(14).strip();
                branch = value.startsWith("(") ? null : value;
            } else if (line.startsWith("# branch.ab ")) {
                String[] parts = line.substring(12).strip().split(" ");
                if (parts.length == 2 && parts[0].startsWith("+") && parts[1].startsWith("-")) {
                    try {
                        ahead = Integer.parseInt(parts[0].substring(1));
                        behind = Integer.parseInt(parts[1].substring(1));
                    } catch (NumberFormatException e) {
                        ahead = null;
                        behind = null;
                    }
                }
            } else if (line.startsWith("? ")) {
                untracked++;
            } else if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ")) {
                changes++;
            }
        }
        return new Local(branch, oid, changes, untracked, ahead, behind);
    }

    /** RG-13 */
    List<String> branches(Repo repo) throws IOException, InterruptedException, GitFailed {
        Result result = ok(Command.gitIn(repo.dir(), "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes/origin"));
        TreeSet<String> names = new TreeSet<>();
        for (String line : result.out()) {
            String ref = line.strip();
            if (ref.startsWith("refs/heads/")) {
                names.add(ref.substring(11));
            } else if (ref.startsWith("refs/remotes/origin/") && !ref.equals("refs/remotes/origin/HEAD")) {
                names.add(ref.substring(20));
            }
        }
        return List.copyOf(names);
    }

    /** RG-14: sin «origin», no coincide. */
    boolean remoteMatches(Repo repo) throws IOException, InterruptedException {
        return normalize(repo.remoteUrl()).equals(normalize(origin(repo)));
    }

    /** La URL de «origin»; null si no hay. No sale nunca del servidor (RG-14). */
    String origin(Repo repo) throws IOException, InterruptedException {
        Result result = run(Command.gitIn(repo.dir(), "remote", "get-url", "origin"));
        return result.code() == 0 && !result.out().isEmpty() ? result.out().get(0).strip() : null;
    }

    private static String normalize(String url) {
        if (url == null) {
            return "";
        }
        String value = url.strip();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value.endsWith(".git") ? value.substring(0, value.length() - 4) : value;
    }

    private Result ok(Command command) throws IOException, InterruptedException, GitFailed {
        Result result = run(command);
        if (result.code() != 0) {
            throw new GitFailed(result.lastError() != null ? result.lastError() : "git ha terminado con el código " + result.code());
        }
        return result;
    }

    private Result run(Command command) throws IOException, InterruptedException {
        List<String> out = Collections.synchronizedList(new ArrayList<>());
        String[] lastError = {null};
        int code = runner.run(command, new CommandRunner.Output() {
            @Override
            public void out(String line) {
                out.add(line);
            }

            @Override
            public void err(String line) {
                synchronized (lastError) {
                    if (!line.isBlank()) {
                        lastError[0] = line.strip();
                    }
                }
            }
        });
        synchronized (out) {
            synchronized (lastError) {
                return new Result(code, List.copyOf(out), lastError[0]);
            }
        }
    }
}
