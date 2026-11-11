package dev.cajonsastre.apps.database;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Un comando externo. BD-16: los secretos van en env y nunca en args, así que args se puede mostrar en el registro del
 * trabajo.
 *
 * @param env   variables que se añaden al entorno del proceso
 * @param stdin fichero que recibe por la entrada estándar; null: entrada vacía
 */
record Command(List<String> args, Map<String, String> env, Path stdin) {

    Command {
        args = List.copyOf(args);
        env = Map.copyOf(env);
    }

    static Command of(String... args) {
        return new Command(List.of(args), Map.of(), null);
    }

    static Command of(List<String> args) {
        return new Command(args, Map.of(), null);
    }

    Command withEnv(String name, String value) {
        Map<String, String> next = new LinkedHashMap<>(env);
        next.put(name, value);
        return new Command(args, next, stdin);
    }

    Command withStdin(Path file) {
        return new Command(args, env, file);
    }

    String program() {
        return args.get(0);
    }

    /** Como se escribiría en una consola, para el registro del trabajo (BD-14). Sin el entorno. */
    String line() {
        String line = args.stream().map(a -> a.isEmpty() || a.chars().anyMatch(Character::isWhitespace) ? "\"" + a + "\"" : a)
                .collect(Collectors.joining(" "));
        return "$ " + line + (stdin == null ? "" : " < " + stdin);
    }
}
