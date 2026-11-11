package dev.cajonsastre.apps.database;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * BD-14: el registro de un trabajo, acotado y solo en memoria. Las líneas tienen un índice que no cambia aunque se
 * descarten las más antiguas, para que la interfaz pida solo las nuevas.
 */
final class JobLog {

    static final int MAX_LINES = 5000;
    static final int MAX_CHARS = 2000;

    /**
     * @param from índice de la primera línea devuelta
     * @param next índice que tendrá la próxima línea: lo que se pasa en la siguiente consulta
     */
    record Slice(long from, long next, List<String> lines) {
    }

    private final Deque<String> lines = new ArrayDeque<>();
    private long first;

    synchronized void add(String line) {
        lines.addLast(line.length() > MAX_CHARS ? line.substring(0, MAX_CHARS) + "…" : line);
        if (lines.size() > MAX_LINES) {
            lines.removeFirst();
            first++;
        }
    }

    /** Las líneas con índice mayor o igual que after. */
    synchronized Slice after(long after) {
        long next = first + lines.size();
        long from = Math.min(Math.max(after, first), next);
        List<String> out = new ArrayList<>((int) (next - from));
        long index = first;
        for (String line : lines) {
            if (index++ >= from) {
                out.add(line);
            }
        }
        return new Slice(from, next, out);
    }
}
