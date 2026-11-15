package dev.cajonsastre.apps.repos;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Un comando externo. Copia reducida de la de «Base de datos»: una mini app no importa el código de otra (P-18,
 * ADR-0019).
 *
 * @param env      variables que se añaden al entorno del proceso
 * @param defaults variables que solo se añaden si el entorno heredado no las define
 */
record Command(List<String> args, Map<String, String> env, Map<String, String> defaults) {

    /** RG-21: git no puede quedarse esperando una contraseña. */
    static final Map<String, String> GIT_ENV = Map.of("GIT_TERMINAL_PROMPT", "0");
    static final Map<String, String> GIT_DEFAULTS = Map.of("GIT_SSH_COMMAND", "ssh -oBatchMode=yes");

    Command {
        args = List.copyOf(args);
        env = Map.copyOf(env);
        defaults = Map.copyOf(defaults);
    }

    /** RG-21: {@code git} seguido de los argumentos, con su entorno. */
    static Command git(String... args) {
        return new Command(java.util.stream.Stream.concat(java.util.stream.Stream.of("git"), List.of(args).stream()).toList(),
                GIT_ENV, GIT_DEFAULTS);
    }

    /** {@code git -C <carpeta>} seguido de los argumentos. */
    static Command gitIn(String dir, String... args) {
        String[] all = new String[args.length + 2];
        all[0] = "-C";
        all[1] = dir;
        System.arraycopy(args, 0, all, 2, args.length);
        return git(all);
    }

    String program() {
        return args.get(0);
    }

    /** Como se escribiría en una terminal, para la consola (RG-28). Sin el entorno. */
    String line() {
        return "$ " + args.stream().map(a -> a.isEmpty() || a.chars().anyMatch(Character::isWhitespace) ? "\"" + a + "\"" : a)
                .collect(Collectors.joining(" "));
    }
}
