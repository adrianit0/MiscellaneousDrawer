package dev.cajonsastre.update;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Publicación (R-01 a R-06, ADR-0010). El workflow y el script se comprueban en todos los sistemas; el script se
 * ejecuta de verdad solo en Linux, en un proyecto mínimo con su propia clave y sin publicar nada.
 */
class ReleaseTest {

    private static final boolean LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");
    private static final Path WORKFLOW = Path.of(".github/workflows/release.yml");
    private static final Path SCRIPT = Path.of("scripts/release.sh");
    private static final Path PUBLIC_KEY = Path.of("src/main/resources/dev/cajonsastre/update/release-key.pub");
    private static final Pattern USES = Pattern.compile("(?m)^\\s*-?\\s*uses:\\s*(\\S+)");

    @TempDir
    Path dir;

    private static String read(Path file) throws IOException {
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    @Test
    void r01_each_push_to_master_runs_the_tests_on_ubuntu_before_publishing() throws IOException {
        String workflow = read(WORKFLOW);
        assertThat(workflow).contains("on:\n  push:\n    branches: [master]\n")
                .contains("paths-ignore:\n      - 'specs/**'\n      - 'README.md'\n      - 'CLAUDE.md'\n      - 'LICENSE'\n")
                .contains("runs-on: ubuntu-22.04");
        int verify = workflow.indexOf("./mvnw -B -Pdist verify");
        int publish = workflow.indexOf("run: scripts/release.sh");
        assertThat(verify).isPositive();
        assertThat(publish).isGreaterThan(verify);
    }

    @Test
    void r05_no_pull_requests_only_contents_write_and_actions_pinned_by_hash() throws IOException {
        String workflow = read(WORKFLOW);
        assertThat(workflow).doesNotContain("pull_request").contains("permissions:\n  contents: write\n\n")
                .contains("persist-credentials: false");
        Matcher uses = USES.matcher(workflow);
        List<String> actions = new ArrayList<>();
        while (uses.find()) {
            actions.add(uses.group(1));
        }
        assertThat(actions).isNotEmpty().allMatch(a -> a.matches("[\\w.-]+/[\\w.-]+@[0-9a-f]{40}"));
    }

    @Test
    void r06_the_workflow_injects_build_and_commit_and_a_handmade_jar_is_build_0() throws IOException {
        assertThat(read(WORKFLOW)).contains("-Dcajonsastre.build=\"$GITHUB_RUN_NUMBER\" -Dcajonsastre.commit=\"$GITHUB_SHA\"");
        assertThat(read(Path.of("pom.xml"))).contains("<cajonsastre.build>0</cajonsastre.build>");
        assertThat(read(Path.of("src/main/resources/dev/cajonsastre/version.properties")))
                .contains("build=${cajonsastre.build}").contains("commit=${cajonsastre.commit}");
    }

    @Test
    void r02_r04_the_script_publishes_the_three_files_signed_with_the_secret() throws IOException {
        String script = read(SCRIPT);
        assertThat(script).startsWith("#!/usr/bin/env bash").contains("set -euo pipefail")
                .contains("JAR=\"target/dist/cajonsastre.jar\"")
                .contains("PUBLIC_KEY=\"" + PUBLIC_KEY.toString().replace('\\', '/') + "\"")
                .contains("${CAJONSASTRE_RELEASE_KEY:?")
                .contains("openssl pkeyutl -sign -rawin")
                .contains("gh release create \"build-$BUILD\" \"$JAR\" \"$OUT/latest.json\" \"$OUT/latest.json.sig\"")
                .doesNotContainIgnoringCase("litedd");
        assertThat(read(WORKFLOW)).contains("CAJONSASTRE_RELEASE_KEY: ${{ secrets.CAJONSASTRE_RELEASE_KEY }}");
    }

    @Test
    void r04_s34_only_the_public_key_is_in_the_repository() throws Exception {
        assertThat(UpdateManifest.publicKey(read(PUBLIC_KEY))).isNotNull();
        assertThat(read(Path.of(".gitignore"))).contains("*.pem");
        List<Path> keys = new ArrayList<>();
        try (var root = Files.list(Path.of("."))) {
            root.filter(p -> p.getFileName().toString().endsWith(".pem")).forEach(keys::add);
        }
        for (String folder : List.of("src", "scripts", "packaging", ".github", "specs", "frontend/src", "frontend/public")) {
            try (var files = Files.walk(Path.of(folder))) {
                files.filter(p -> p.getFileName().toString().endsWith(".pem")).forEach(keys::add);
            }
        }
        assertThat(keys).isEmpty();
    }

    // --- Ejecución real del script, solo en Linux ---

    private record Result(int code, String output) {
    }

    private Result run(Path cwd, Map<String, String> env, String... command) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command).directory(cwd.toFile()).redirectErrorStream(true);
        pb.environment().putAll(Map.of("GIT_AUTHOR_NAME", "Prueba", "GIT_AUTHOR_EMAIL", "prueba@example.invalid",
                "GIT_COMMITTER_NAME", "Prueba", "GIT_COMMITTER_EMAIL", "prueba@example.invalid"));
        // El de la prueba, nunca uno heredado.
        pb.environment().remove("CAJONSASTRE_RELEASE_KEY");
        pb.environment().putAll(env);
        Process p = pb.start();
        String output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(p.waitFor(60, TimeUnit.SECONDS)).isTrue();
        return new Result(p.exitValue(), output);
    }

    private static String pem(KeyPair keys) {
        return "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(keys.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----";
    }

    /** Un proyecto mínimo con el script, su clave pública, un JAR y tres commits, el primero ya publicado. */
    private Path project(KeyPair keys, byte[] jar) throws Exception {
        Path project = Files.createDirectories(dir.resolve("proyecto"));
        Path script = Files.createDirectories(project.resolve("scripts")).resolve("release.sh");
        Files.copy(SCRIPT, script);
        assertThat(script.toFile().setExecutable(true)).isTrue();
        Files.writeString(project.resolve("pom.xml"), "<project>\n  <modelVersion>4.0.0</modelVersion>\n  <version>1.2.3</version>\n</project>\n");
        Path key = project.resolve(PUBLIC_KEY);
        Files.createDirectories(key.getParent());
        Files.writeString(key, Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()) + "\n");
        Path built = project.resolve("target/dist/cajonsastre.jar");
        Files.createDirectories(built.getParent());
        Files.write(built, jar);
        assertThat(run(project, Map.of(), "git", "init", "-q").code()).isZero();
        for (String subject : List.of("Primer cambio", "Segundo cambio", "Tercer cambio")) {
            assertThat(run(project, Map.of(), "git", "commit", "-q", "--allow-empty", "-m", subject).code()).isZero();
            if (subject.equals("Primer cambio")) {
                assertThat(run(project, Map.of(), "git", "tag", "build-1").code()).isZero();
            }
        }
        return project;
    }

    private static boolean tools() {
        for (String tool : List.of("bash", "git", "jq", "openssl", "sha256sum", "base64")) {
            try {
                if (new ProcessBuilder("sh", "-c", "command -v " + tool).start().waitFor() != 0) {
                    return false;
                }
            } catch (Exception e) {
                return false;
            }
        }
        return true;
    }

    @Test
    void r02_r03_r04_the_manifest_lists_the_jar_and_the_new_commits_and_its_signature_verifies() throws Exception {
        assumeTrue(LINUX && tools(), "Solo en Linux con git, jq y openssl");
        KeyPair keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] jar = "jar publicado".getBytes(StandardCharsets.UTF_8);
        Path project = project(keys, jar);
        Path out = dir.resolve("release");
        Result r = run(project, Map.of("GITHUB_RUN_NUMBER", "2", "GITHUB_SHA", "0123456789abcdef0123456789abcdef01234567",
                "CAJONSASTRE_RELEASE_KEY", pem(keys)), "scripts/release.sh", out.toString());
        assertThat(r.code()).as(r.output()).isZero();

        byte[] json = Files.readAllBytes(out.resolve("latest.json"));
        UpdateManifest manifest = UpdateManifest.verified(json, Files.readAllBytes(out.resolve("latest.json.sig")), keys.getPublic());
        assertThat(manifest.build()).isEqualTo(2);
        assertThat(manifest.version()).isEqualTo("1.2.3");
        assertThat(manifest.commit()).isEqualTo("0123456789abcdef0123456789abcdef01234567");
        assertThat(manifest.size()).isEqualTo(jar.length);
        assertThat(manifest.sha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(jar)));
        assertThat(manifest.commits()).containsExactly("Tercer cambio", "Segundo cambio");
        JsonNode raw = new ObjectMapper().readTree(json);
        assertThat(raw.get("date").asText()).matches("\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ");
    }

    @Test
    void r04_r30_a_key_that_does_not_match_the_public_one_publishes_nothing() throws Exception {
        assumeTrue(LINUX && tools(), "Solo en Linux con git, jq y openssl");
        KeyPair keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        KeyPair other = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        Path project = project(keys, new byte[]{1, 2, 3});
        Path out = dir.resolve("release");
        Result r = run(project, Map.of("GITHUB_RUN_NUMBER", "2", "GITHUB_SHA", "abc", "CAJONSASTRE_RELEASE_KEY", pem(other)),
                "scripts/release.sh", out.toString());
        assertThat(r.code()).isEqualTo(1);
        assertThat(r.output()).contains("no corresponde");
        assertThat(out).doesNotExist();
    }

    @Test
    void r04_without_the_secret_nothing_is_published() throws Exception {
        assumeTrue(LINUX && tools(), "Solo en Linux con git, jq y openssl");
        KeyPair keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        Path project = project(keys, new byte[]{1, 2, 3});
        Path out = dir.resolve("release");
        Result r = run(project, Map.of("GITHUB_RUN_NUMBER", "2", "GITHUB_SHA", "abc"), "scripts/release.sh", out.toString());
        assertThat(r.code()).isNotZero();
        assertThat(r.output()).contains("CAJONSASTRE_RELEASE_KEY");
        assertThat(out).doesNotExist();
    }
}
