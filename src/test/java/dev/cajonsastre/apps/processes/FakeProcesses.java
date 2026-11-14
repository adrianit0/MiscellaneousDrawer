package dev.cajonsastre.apps.processes;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/** Una tabla de procesos inventada: las pruebas no ven ni cierran ningún proceso del equipo (ADR-0018). */
final class FakeProcesses implements ProcessTable {

    static final long SELF = 4242;

    final Map<Long, String> commands = new LinkedHashMap<>();
    final List<Listener> listening = new ArrayList<>();
    /** Los que no se dejan cerrar (CP-22). */
    final Set<Long> immortal = new TreeSet<>();
    /** Los que se ha pedido cerrar, en orden. */
    final List<Long> killed = new ArrayList<>();
    /** Si no es null, ss falla con este mensaje (CP-15). */
    String listenersFailure;

    FakeProcesses process(long pid, String command) {
        commands.put(pid, command);
        return this;
    }

    FakeProcesses listen(int port, Long... pids) {
        listening.add(new Listener(port, List.of(pids)));
        return this;
    }

    @Override
    public long self() {
        return SELF;
    }

    @Override
    public List<Proc> processes() {
        return commands.entrySet().stream().map(e -> new Proc(e.getKey(), e.getValue())).toList();
    }

    @Override
    public List<Listener> listeners() throws IOException {
        if (listenersFailure != null) {
            throw new IOException(listenersFailure);
        }
        return List.copyOf(listening);
    }

    @Override
    public boolean kill(long pid) {
        killed.add(pid);
        if (immortal.contains(pid)) {
            return false;
        }
        commands.remove(pid);
        listening.replaceAll(l -> new Listener(l.port(), l.pids().stream().filter(p -> p != pid).toList()));
        listening.removeIf(l -> l.pids().isEmpty() && !blockedPorts.contains(l.port()));
        return true;
    }

    /** Puertos de otro usuario: siguen ocupados aunque no tengan procesos visibles (CP-15). */
    final Set<Integer> blockedPorts = new TreeSet<>();

    FakeProcesses blocked(int port) {
        blockedPorts.add(port);
        listening.add(new Listener(port, List.of()));
        return this;
    }
}
