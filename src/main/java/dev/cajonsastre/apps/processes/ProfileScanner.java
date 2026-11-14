package dev.cajonsastre.apps.processes;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** CP-10 a CP-23: la búsqueda de un perfil y su cierre. */
final class ProfileScanner {

    /** CP-13 */
    static final int MAX_COMMAND = 300;

    /** CP-13 */
    record Found(long pid, String command, List<Integer> ports, boolean byPattern) {
    }

    /** CP-10, CP-15 */
    record Scan(List<Found> processes, List<Integer> blockedPorts, String warning) {
    }

    /** CP-22 */
    record Failed(long pid, String command) {
    }

    /** CP-21, CP-22 */
    record Closed(List<Long> closed, List<Failed> failed, List<Long> gone) {
    }

    private static final Logger log = LoggerFactory.getLogger(ProfileScanner.class);

    private final ProcessTable table;

    ProfileScanner(ProcessTable table) {
        this.table = table;
    }

    /** CP-10 a CP-15 */
    Scan scan(Profile profile) throws InterruptedException {
        long self = table.self();
        Map<Long, String> commands = new HashMap<>();
        for (ProcessTable.Proc proc : table.processes()) {
            commands.put(proc.pid(), proc.command() == null ? "" : proc.command());
        }
        commands.remove(self);

        // CP-11
        Set<Long> byPattern = new TreeSet<>();
        Pattern regex = profile.regex();
        if (regex != null) {
            commands.forEach((pid, command) -> {
                if (regex.matcher(command).find()) {
                    byPattern.add(pid);
                }
            });
        }

        // CP-12, CP-15
        Map<Long, Set<Integer>> ports = new TreeMap<>();
        Set<Integer> blocked = new TreeSet<>();
        String warning = null;
        if (profile.portFrom() != null) {
            try {
                for (ProcessTable.Listener listener : table.listeners()) {
                    if (!profile.inRange(listener.port())) {
                        continue;
                    }
                    if (listener.pids().isEmpty()) {
                        blocked.add(listener.port());
                    }
                    for (long pid : listener.pids()) {
                        if (pid != self) {
                            ports.computeIfAbsent(pid, p -> new TreeSet<>()).add(listener.port());
                        }
                    }
                }
            } catch (IOException e) {
                ports.clear();
                blocked.clear();
                warning = e.getMessage();
            }
        }

        // CP-13
        Set<Long> pids = new TreeSet<>(byPattern);
        pids.addAll(ports.keySet());
        List<Found> found = new ArrayList<>();
        for (long pid : pids) {
            String command = commands.getOrDefault(pid, "");
            found.add(new Found(pid, command.length() > MAX_COMMAND ? command.substring(0, MAX_COMMAND) : command,
                    List.copyOf(ports.getOrDefault(pid, Set.of())), byPattern.contains(pid)));
        }
        return new Scan(found, List.copyOf(blocked), warning);
    }

    /** CP-21 a CP-23 */
    Closed close(Profile profile, List<Long> requested) throws InterruptedException {
        Map<Long, Found> current = new HashMap<>();
        for (Found found : scan(profile).processes()) {
            current.put(found.pid(), found);
        }
        List<Long> closed = new ArrayList<>();
        List<Failed> failed = new ArrayList<>();
        List<Long> gone = new ArrayList<>();
        for (long pid : new LinkedHashSet<>(requested)) {
            Found found = current.get(pid);
            if (found == null) {
                gone.add(pid);
            } else if (table.kill(pid)) {
                closed.add(pid);
            } else {
                failed.add(new Failed(pid, found.command()));
            }
        }
        // CP-23, S-21: sin líneas de comandos.
        log.info("Mini app processes: perfil {}: {} procesos cerrados, {} sin cerrar y {} que ya no estaban", profile.id(),
                closed.size(), failed.size(), gone.size());
        return new Closed(closed, failed, gone);
    }
}
