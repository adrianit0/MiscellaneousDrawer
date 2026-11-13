package dev.cajonsastre.apps.quality;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Un comando externo. CD-22: los secretos van en env y nunca en args, así que args se puede escribir en la consola de
 * la comprobación (CD-25). Es una copia de la de «Base de datos»: una mini app no importa el código de otra (P-18,
 * ADR-0016).
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

    /** Como se escribiría en una terminal, para la consola (CD-25). Sin el entorno. */
    String line() {
        String line = args.stream().map(a -> a.isEmpty() || a.chars().anyMatch(Character::isWhitespace) ? "\"" + a + "\"" : a)
                .collect(Collectors.joining(" "));
        return "$ " + line + (stdin == null ? "" : " < " + stdin);
    }
}
