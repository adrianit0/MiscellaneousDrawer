package dev.cajonsastre.apps.resubmit;

import java.util.Collection;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** RP-07, RP-11, RP-14: nombres de rama, su clave de Jira, su iteración y la rama nueva. */
final class Branches {

    static final int MAX_BRANCH = 100;
    private static final Pattern BRANCH = Pattern.compile("[A-Za-z0-9_][A-Za-z0-9._/-]*");
    /** RP-11: la clave no puede llevar más guion que el que separa sus números; lo que sigue es la iteración. */
    private static final Pattern FORMAT = Pattern.compile("([A-Za-z][A-Za-z0-9_]*-[0-9]+)(?:-([0-9]{1,3}))?");

    private Branches() {
    }

    /** RP-11: la clave tal como se escribe en la rama y su iteración. */
    record Parsed(String key, int iteration) {
        /** RP-11: dos claves que solo se diferencian en mayúsculas son la misma. */
        String group() {
            return key.toUpperCase(Locale.ROOT);
        }
    }

    /** RP-07: así ningún valor puede leerse como una opción de git. */
    static boolean valid(String branch) {
        return branch != null && branch.length() <= MAX_BRANCH && BRANCH.matcher(branch).matches() && !branch.endsWith("/")
                && !branch.endsWith(".lock") && !branch.contains("..") && !branch.contains("//");
    }

    /** RP-02: el formato de RP-07, que puede terminar en «/». */
    static boolean validPrefix(String prefix, int max) {
        if (prefix == null || prefix.isEmpty() || prefix.length() > max) {
            return false;
        }
        String bare = prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
        return !bare.isEmpty() && valid(bare);
    }

    /** RP-11: vacío si la rama no es {@code <prefijo><clave>} ni {@code <prefijo><clave>-<N>}. */
    static Optional<Parsed> parse(String prefix, String branch) {
        if (branch == null || !branch.startsWith(prefix)) {
            return Optional.empty();
        }
        Matcher m = FORMAT.matcher(branch.substring(prefix.length()));
        if (!m.matches()) {
            return Optional.empty();
        }
        int iteration = m.group(2) == null ? 1 : Integer.parseInt(m.group(2));
        return Optional.of(new Parsed(m.group(1), iteration));
    }

    /**
     * RP-14: {@code <prefijo><clave>-<N>}, con N la mayor iteración conocida de la clave más uno. La clave se escribe
     * como se recibe.
     */
    static String next(String prefix, String key, Collection<String> known) {
        String group = key.toUpperCase(Locale.ROOT);
        int max = 1;
        for (String branch : known) {
            Optional<Parsed> parsed = parse(prefix, branch);
            if (parsed.isPresent() && parsed.get().group().equals(group)) {
                max = Math.max(max, parsed.get().iteration());
            }
        }
        return prefix + key + "-" + (max + 1);
    }
}
