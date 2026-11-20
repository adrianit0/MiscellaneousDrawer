package dev.cajonsastre.apps.resubmit;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** RP-11 a RP-14: qué PR rechazados se pueden reenviar y con qué rama. */
final class Candidates {

    /** RP-12 */
    static final Duration WINDOW = Duration.ofDays(30);
    static final String NOT_FORMAT = "La rama no sigue el formato %s<clave de Jira>";
    static final String FORK = "El PR viene de otro repositorio";

    private Candidates() {
    }

    /** RP-13: un PR rechazado de la lista. ticket y newBranch son null si no se puede reenviar. */
    record Candidate(PullRequest pr, String ticket, String newBranch, boolean selectable, String reason) {

        Map<String, Object> view() {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", pr.id());
            out.put("title", pr.title());
            out.put("branch", pr.branch());
            out.put("ticket", ticket);
            out.put("link", pr.link());
            out.put("declinedAt", pr.closedDate() == null ? null : Instant.ofEpochMilli(pr.closedDate()).toString());
            out.put("reviewers", pr.reviewers());
            out.put("newBranch", newBranch);
            out.put("selectable", selectable);
            out.put("reason", reason);
            return out;
        }
    }

    /**
     * RP-12, RP-13: de cada clave, el PR más reciente si está rechazado desde hace 30 días o menos; y los rechazados en
     * ese plazo que no se pueden reenviar. Del rechazado más reciente al más antiguo.
     *
     * @param known ramas que también cuentan para la rama nueva, además de las de los PR (RP-14)
     */
    static List<Candidate> of(List<PullRequest> prs, String prefix, Instant now, List<String> known) {
        Map<String, PullRequest> newest = new HashMap<>();
        List<String> branches = new ArrayList<>(known);
        for (PullRequest pr : prs) {
            branches.add(pr.branch());
            Branches.parse(prefix, pr.branch()).ifPresent(p -> newest.merge(p.group(), pr,
                    (a, b) -> b.createdDate() > a.createdDate() ? b : a));
        }
        long since = now.minus(WINDOW).toEpochMilli();
        List<Candidate> out = new ArrayList<>();
        for (PullRequest pr : prs) {
            if (!pr.declined() || pr.closedDate() == null || pr.closedDate() < since) {
                continue;
            }
            Optional<Branches.Parsed> parsed = Branches.parse(prefix, pr.branch());
            if (parsed.isEmpty()) {
                out.add(new Candidate(pr, null, null, false, NOT_FORMAT.formatted(prefix)));
            } else if (newest.get(parsed.get().group()) != pr) {
                // RP-12: ya hay otro PR más reciente de la misma clave.
                continue;
            } else if (!pr.sameRepo()) {
                out.add(new Candidate(pr, parsed.get().key(), null, false, FORK));
            } else {
                out.add(new Candidate(pr, parsed.get().key(), Branches.next(prefix, parsed.get().key(), branches), true, null));
            }
        }
        out.sort(Comparator.comparing((Candidate c) -> c.pr().closedDate()).reversed());
        return out;
    }
}
