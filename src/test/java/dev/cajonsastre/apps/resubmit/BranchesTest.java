package dev.cajonsastre.apps.resubmit;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** RP-07, RP-11 a RP-14 sin servidor: el formato de rama, la iteración y qué PR quedan pendientes. Datos inventados (S-31). */
class BranchesTest {

    static final Instant NOW = Instant.parse("2026-03-10T12:00:00Z");

    @Test
    void rp07_branch_names_cannot_be_read_as_git_options() {
        assertThat(Branches.valid("hotfix")).isTrue();
        assertThat(Branches.valid("release/1.2")).isTrue();
        assertThat(List.of("-hotfix", "/hotfix", ".hotfix", "hot..fix", "hot//fix", "hotfix/", "hotfix.lock", "hot fix", ""))
                .noneMatch(Branches::valid);
        assertThat(Branches.validPrefix("bug/", 50)).isTrue();
        assertThat(Branches.validPrefix("bugfix-", 50)).isTrue();
        assertThat(List.of("/", "-bug/", "bug//", "")).noneMatch(p -> Branches.validPrefix(p, 50));
    }

    @Test
    void rp11_the_iteration_comes_after_the_jira_key_and_is_not_its_number() {
        assertThat(Branches.parse("bug/", "bug/TICKET-0001")).contains(new Branches.Parsed("TICKET-0001", 1));
        assertThat(Branches.parse("bug/", "bug/TICKET-0001-2")).contains(new Branches.Parsed("TICKET-0001", 2));
        assertThat(Branches.parse("bug/", "bug/AB_2-7-13")).contains(new Branches.Parsed("AB_2-7", 13));
        assertThat(Branches.parse("bug/", "bug/ticket-0001").orElseThrow().group()).isEqualTo("TICKET-0001");
        assertThat(Branches.parse("bug/", "bug/TICKET-0001-arregla-login")).isEmpty();
        assertThat(Branches.parse("bug/", "bug/TICKET-0001-1234")).isEmpty();
        assertThat(Branches.parse("bug/", "feature/TICKET-0001")).isEmpty();
        assertThat(Branches.parse("bug/", "bug/0001")).isEmpty();
    }

    @Test
    void rp14_the_new_branch_is_the_next_iteration_of_any_known_branch_of_the_key() {
        assertThat(Branches.next("bug/", "TICKET-0001", List.of("bug/TICKET-0001"))).isEqualTo("bug/TICKET-0001-2");
        assertThat(Branches.next("bug/", "TICKET-0001", List.of("bug/TICKET-0001", "bug/ticket-0001-2", "bug/TICKET-0002-5")))
                .isEqualTo("bug/TICKET-0001-3");
        assertThat(Branches.next("bug/", "TICKET-0001", List.of())).isEqualTo("bug/TICKET-0001-2");
    }

    private static PullRequest pr(long id, String branch, String state, int createdDaysAgo, Integer closedDaysAgo, boolean same) {
        return new PullRequest(id, "PR " + id, null, state, branch, "a".repeat(40), same, FakeBitbucket.USER,
                NOW.minus(Duration.ofDays(createdDaysAgo)).toEpochMilli(),
                closedDaysAgo == null ? null : NOW.minus(Duration.ofDays(closedDaysAgo)).toEpochMilli(), List.of(),
                "https://bitbucket.example.test/pr/" + id);
    }

    @Test
    void rp12_rp13_only_the_newest_pr_of_each_key_counts_and_only_if_declined_in_the_last_30_days() {
        List<PullRequest> prs = List.of(
                // Ya reenviado: el más reciente de su clave está abierto.
                pr(9, "bug/TICKET-0001-2", "OPEN", 1, null, true),
                pr(8, "bug/TICKET-0001", "DECLINED", 10, 2, true),
                // Pendiente, ya en su segunda iteración.
                pr(7, "bug/TICKET-0002-2", "DECLINED", 5, 3, true),
                pr(6, "bug/TICKET-0002", "DECLINED", 40, 35, true),
                // Rechazado hace demasiado.
                pr(5, "bug/TICKET-0003", "DECLINED", 50, 31, true),
                // Mezclado.
                pr(4, "bug/TICKET-0004", "MERGED", 8, 4, true),
                // No se pueden reenviar.
                pr(3, "bug/TICKET-0005-arreglo", "DECLINED", 6, 1, true),
                pr(2, "bug/TICKET-0006", "DECLINED", 6, 5, false),
                // Pendiente.
                pr(1, "bug/TICKET-0007", "DECLINED", 9, 2, true));
        List<Candidates.Candidate> list = Candidates.of(prs, "bug/", NOW, List.of("bug/TICKET-0007-2"));

        assertThat(list).extracting(c -> c.pr().id()).containsExactly(3L, 1L, 7L, 2L);
        Candidates.Candidate format = list.get(0);
        assertThat(format.selectable()).isFalse();
        assertThat(format.reason()).isEqualTo("La rama no sigue el formato bug/<clave de Jira>");
        assertThat(format.newBranch()).isNull();
        // RP-14: también cuentan las ramas del remoto.
        assertThat(list.get(1).newBranch()).isEqualTo("bug/TICKET-0007-3");
        assertThat(list.get(1).selectable()).isTrue();
        assertThat(list.get(2).newBranch()).isEqualTo("bug/TICKET-0002-3");
        assertThat(list.get(2).ticket()).isEqualTo("TICKET-0002");
        assertThat(list.get(3).reason()).isEqualTo("El PR viene de otro repositorio");
        assertThat(list.get(3).view()).containsEntry("selectable", false).containsEntry("declinedAt", "2026-03-05T12:00:00Z");
    }

    @Test
    void rp21_the_origin_must_end_in_the_configured_project_and_repository() {
        assertThat(JobRunner.originMatches("https://bitbucket.example.test/scm/proj/demo.git", "PROJ", "demo")).isTrue();
        assertThat(JobRunner.originMatches("ssh://git@bitbucket.example.test:7999/PROJ/Demo.git/", "PROJ", "demo")).isTrue();
        assertThat(JobRunner.originMatches("git@bitbucket.example.test:proj/demo.git", "PROJ", "demo")).isTrue();
        assertThat(JobRunner.originMatches("C:\\servidor\\PROJ\\demo.git", "PROJ", "demo")).isTrue();
        assertThat(JobRunner.originMatches("https://bitbucket.example.test/scm/proj/demo-otro.git", "PROJ", "demo")).isFalse();
        assertThat(JobRunner.originMatches("https://bitbucket.example.test/scm/otro/demo.git", "PROJ", "demo")).isFalse();
    }

    @Test
    void rp28_the_description_ends_with_where_it_comes_from() {
        PullRequest with = new PullRequest(1, "T", "Texto\n", "DECLINED", "bug/A-1", null, true, "u", 0, 0L, List.of(), "https://x/1");
        PullRequest without = new PullRequest(1, "T", null, "DECLINED", "bug/A-1", null, true, "u", 0, 0L, List.of(), "https://x/1");
        assertThat(Bitbucket.description(with)).isEqualTo("Texto\n\nProcede de: https://x/1");
        assertThat(Bitbucket.description(without)).isEqualTo("Procede de: https://x/1");
    }

    @Test
    void rp32_the_summary_counts_each_result() {
        JobRunner.PrResult created = new JobRunner.PrResult(1, null, null, null, "created", null, null);
        JobRunner.PrResult conflict = created.with("conflict", null);
        assertThat(JobRunner.summary(List.of(created, created, conflict))).isEqualTo("2 recreados, 1 con conflictos");
        assertThat(JobRunner.summary(List.of(created, created.with("skipped", null), created.with("failed", null))))
                .isEqualTo("1 recreado, 1 omitido, 1 con error");
    }
}
