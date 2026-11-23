package dev.cajonsastre.apps.jira;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * JR-21, JR-22: el JQL de un tablero y el reparto de sus tickets en columnas. El JQL solo lleva claves de proyecto e
 * identificadores de estado que cumplen JR-12, así que ningún valor guardado puede cambiarlo.
 */
final class IssueQuery {

    /** JR-21: la columna final solo muestra los tickets actualizados en estos días. */
    static final int RECENT_DAYS = 14;
    /** JR-23 */
    static final int MAX_ISSUES = 1000;

    private IssueQuery() {
    }

    /**
     * JR-21: el JQL con los pares de cada columna que siguen existiendo en Jira, o null si no hay ninguno y no hay que
     * consultar.
     *
     * @param exists si un par proyecto-estado sigue en Jira (JR-20, missingStatuses)
     */
    static String jql(Board board, Predicate<Board.StatusRef> exists) {
        List<Board.Column> columns = board.columns();
        List<Board.Column> openColumns = columns.subList(0, columns.size() - 1);
        Set<String> projects = columns.stream().flatMap(c -> c.statuses().stream()).filter(exists)
                .map(Board.StatusRef::project).collect(Collectors.toCollection(LinkedHashSet::new));
        if (projects.isEmpty()) {
            return null;
        }
        // Por proyecto: un mismo identificador de estado puede estar en dos proyectos y en columnas distintas.
        List<String> clauses = new ArrayList<>();
        for (String project : projects) {
            List<String> open = ids(openColumns, project, exists);
            List<String> closed = ids(List.of(board.last()), project, exists);
            List<String> parts = new ArrayList<>();
            if (!open.isEmpty()) {
                parts.add("status in (" + String.join(", ", open) + ")");
            }
            if (!closed.isEmpty()) {
                parts.add("(status in (" + String.join(", ", closed) + ") AND updated >= -" + RECENT_DAYS + "d)");
            }
            clauses.add("(project = \"" + project + "\" AND (" + String.join(" OR ", parts) + "))");
        }
        return String.join(" OR ", clauses) + " ORDER BY updated DESC";
    }

    private static List<String> ids(List<Board.Column> columns, String project, Predicate<Board.StatusRef> exists) {
        return columns.stream().flatMap(c -> c.statuses().stream())
                .filter(s -> s.project().equals(project) && exists.test(s)).map(Board.StatusRef::id).toList();
    }

    /**
     * JR-22: cada ticket en la columna que tiene el par de su proyecto y su estado, en el orden en que llegaron (del
     * actualizado más recientemente al más antiguo). Uno sin columna no se muestra.
     */
    static Map<Board.Column, List<Jira.Issue>> place(Board board, List<Jira.Issue> issues) {
        Map<String, Board.Column> byPair = new HashMap<>();
        Map<Board.Column, List<Jira.Issue>> out = new LinkedHashMap<>();
        for (Board.Column column : board.columns()) {
            out.put(column, new ArrayList<>());
            column.statuses().forEach(s -> byPair.put(s.pair(), column));
        }
        for (Jira.Issue issue : issues) {
            Board.Column column = byPair.get(issue.project() + "/" + issue.statusId());
            if (column != null) {
                out.get(column).add(issue);
            }
        }
        return out;
    }
}
