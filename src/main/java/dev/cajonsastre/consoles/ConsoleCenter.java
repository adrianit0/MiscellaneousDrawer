package dev.cajonsastre.consoles;

import dev.cajonsastre.http.ApiRoutes;
import dev.cajonsastre.platform.ApiError;
import dev.cajonsastre.platform.AppManifest;
import dev.cajonsastre.platform.Console;
import dev.cajonsastre.platform.ConsoleState;
import dev.cajonsastre.platform.Consoles;
import io.javalin.config.RoutesConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;
import java.util.function.Predicate;

/**
 * Consolas de las mini apps (P-25 a P-28, ADR-0014): la salida de texto de sus ejecuciones, con un nombre y un
 * estado. Todo vive en memoria: ni a disco ni al registro del shell (P-26, S-21). GET y DELETE /api/consoles y
 * GET /api/consoles/{id}.
 */
public final class ConsoleCenter implements ApiRoutes {

    /** P-26 */
    public static final int KEEP = 20;
    public static final int MAX_LINES = 5000;
    /** P-25 */
    public static final int MAX_CHARS = 2000;
    public static final int MAX_NAME = 80;
    static final String RUNNING = "running";
    private static final Logger log = LoggerFactory.getLogger(ConsoleCenter.class);

    /** Una consola sin sus líneas, como sale por la API. finishedAt es null mientras está en progreso. */
    public record View(long id, String appId, String name, String state, String startedAt, String finishedAt) {
    }

    /**
     * P-27: líneas de una consola.
     *
     * @param from índice de la primera línea devuelta
     * @param next índice que tendrá la próxima línea: lo que se pasa en la siguiente consulta
     */
    public record Slice(View console, long from, long next, List<String> lines) {
    }

    private final Clock clock;
    private final Predicate<String> known;
    /** En el orden en que se abrieron. Se toca con el monitor de este objeto. */
    private final List<Entry> entries = new ArrayList<>();
    private final List<Consumer<List<View>>> listeners = new CopyOnWriteArrayList<>();
    private long ids;

    /**
     * @param known P-27: si un identificador sigue en el catálogo
     */
    public ConsoleCenter(Clock clock, Predicate<String> known) {
        this.clock = clock;
        this.known = known;
    }

    /** P-25: las consolas de una mini app, ya con su identidad. */
    public Consoles forApp(AppManifest app) {
        return name -> open(app, name);
    }

    /** P-28: avisa de cada cambio en la lista, con la lista ya cambiada. */
    public void onChange(Consumer<List<View>> listener) {
        listeners.add(listener);
    }

    /** P-27: de la más reciente a la más antigua, sin las de mini apps que ya no están en el catálogo. */
    public synchronized List<View> list() {
        List<View> out = new ArrayList<>();
        for (int i = entries.size() - 1; i >= 0; i--) {
            Entry e = entries.get(i);
            if (known.test(e.appId)) {
                out.add(e.view());
            }
        }
        return out;
    }

    /** P-27: las líneas de una consola con índice mayor o igual que after. */
    public Slice slice(long id, long after) {
        Entry entry;
        synchronized (this) {
            entry = entries.stream().filter(e -> e.id == id).findFirst().orElse(null);
        }
        if (entry == null) {
            throw notFound();
        }
        return entry.slice(after);
    }

    /** P-27: descarta las que no están en progreso y devuelve las que quedan. */
    public synchronized List<View> clear() {
        entries.removeIf(e -> !e.running());
        changed();
        return list();
    }

    @Override
    public void register(RoutesConfig routes) {
        routes.get("/api/consoles", ctx -> ctx.json(Map.of("consoles", list())));
        routes.delete("/api/consoles", ctx -> ctx.json(Map.of("consoles", clear())));
        routes.get("/api/consoles/{id}", ctx -> {
            long id;
            try {
                id = Long.parseLong(ctx.pathParam("id"));
            } catch (NumberFormatException e) {
                throw notFound();
            }
            long after = 0;
            String param = ctx.queryParam("after");
            if (param != null) {
                try {
                    after = Long.parseLong(param);
                } catch (NumberFormatException e) {
                    throw ApiError.badRequest("invalid_request", "El parámetro after debe ser un número");
                }
            }
            ctx.json(slice(id, after));
        });
    }

    private static ApiError notFound() {
        return ApiError.notFound("console_not_found", "La consola no existe");
    }

    private synchronized Console open(AppManifest app, String name) {
        // P-25: un nombre fuera de formato es un error de programación de la mini app.
        String clean = name == null ? "" : name.strip();
        if (clean.isEmpty() || clean.length() > MAX_NAME) {
            throw new IllegalArgumentException("El nombre de una consola debe tener de 1 a " + MAX_NAME + " caracteres");
        }
        Entry entry = new Entry(++ids, app.id(), clean, clock.instant());
        entries.add(entry);
        // P-26: se descarta la terminada más antigua; una en progreso, nunca.
        while (entries.size() > KEEP) {
            Entry oldest = entries.stream().filter(e -> !e.running()).findFirst().orElse(null);
            if (oldest == null) {
                break;
            }
            entries.remove(oldest);
        }
        changed();
        return entry;
    }

    private synchronized void finish(Entry entry, ConsoleState state) {
        if (entry.end(state.id(), clock.instant())) {
            changed();
        }
    }

    /** P-28: con el monitor tomado, para que los avisos salgan en el orden de los cambios. S-21: sin nombres. */
    private void changed() {
        if (listeners.isEmpty()) {
            return;
        }
        List<View> all = list();
        for (Consumer<List<View>> listener : listeners) {
            try {
                listener.accept(all);
            } catch (RuntimeException e) {
                log.warn("No se pudo repartir la lista de consolas", e);
            }
        }
    }

    private static String iso(Instant instant) {
        return instant == null ? null : instant.truncatedTo(ChronoUnit.SECONDS).toString();
    }

    /** Una consola con sus líneas. Su estado y sus líneas se tocan con su propio monitor. */
    private final class Entry implements Console {
        final long id;
        final String appId;
        final String name;
        final Instant startedAt;
        private final Deque<String> lines = new ArrayDeque<>();
        /** Índice de la primera línea que se conserva (P-26). */
        private long first;
        private String state = RUNNING;
        private Instant finishedAt;

        Entry(long id, String appId, String name, Instant startedAt) {
            this.id = id;
            this.appId = appId;
            this.name = name;
            this.startedAt = startedAt;
        }

        @Override
        public long id() {
            return id;
        }

        @Override
        public void line(String text) {
            if (text == null) {
                return;
            }
            List<String> parts = text.isEmpty() ? List.of("") : text.lines().toList();
            synchronized (this) {
                if (!state.equals(RUNNING)) {
                    return;
                }
                for (String part : parts) {
                    lines.addLast(part.length() > MAX_CHARS ? part.substring(0, MAX_CHARS) + "…" : part);
                    if (lines.size() > MAX_LINES) {
                        lines.removeFirst();
                        first++;
                    }
                }
            }
        }

        @Override
        public void finish(ConsoleState state) {
            if (state == null) {
                throw new IllegalArgumentException("Falta el estado con el que termina la consola");
            }
            ConsoleCenter.this.finish(this, state);
        }

        synchronized boolean running() {
            return state.equals(RUNNING);
        }

        /** false si ya había terminado. */
        synchronized boolean end(String state, Instant at) {
            if (!this.state.equals(RUNNING)) {
                return false;
            }
            this.state = state;
            this.finishedAt = at;
            return true;
        }

        synchronized View view() {
            return new View(id, appId, name, state, iso(startedAt), iso(finishedAt));
        }

        synchronized Slice slice(long after) {
            long next = first + lines.size();
            long from = Math.min(Math.max(after, first), next);
            List<String> out = new ArrayList<>((int) (next - from));
            long index = first;
            for (String line : lines) {
                if (index++ >= from) {
                    out.add(line);
                }
            }
            return new Slice(view(), from, next, out);
        }
    }
}
