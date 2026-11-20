package dev.cajonsastre.apps.resubmit;

import java.util.List;

/**
 * RP-10: lo que la mini app usa de un PR de Bitbucket.
 *
 * @param branch       la rama de origen, sin {@code refs/heads/}
 * @param latestCommit el último commit de la rama de origen (RP-24); null si Bitbucket no lo da
 * @param sameRepo     false si la rama de origen está en otro repositorio (RP-13)
 * @param closedDate   milisegundos; null si sigue abierto
 * @param reviewers    los nombres de usuario de sus revisores (RP-28)
 * @param link         la dirección del PR en Bitbucket
 */
record PullRequest(long id, String title, String description, String state, String branch, String latestCommit,
                   boolean sameRepo, String author, long createdDate, Long closedDate, List<String> reviewers, String link) {

    PullRequest {
        reviewers = List.copyOf(reviewers);
    }

    boolean declined() {
        return "DECLINED".equals(state);
    }
}
