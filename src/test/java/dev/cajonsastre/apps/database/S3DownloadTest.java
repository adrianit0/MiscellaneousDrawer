package dev.cajonsastre.apps.database;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static dev.cajonsastre.apps.database.Fixtures.BUCKET;
import static dev.cajonsastre.apps.database.Fixtures.MONDAY;
import static dev.cajonsastre.apps.database.Fixtures.TUESDAY;
import static dev.cajonsastre.apps.database.Fixtures.WEDNESDAY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BD-20 a BD-29: la descarga de S3, con un aws simulado y bloques de 10 bytes. */
class S3DownloadTest {

    private static final String DUMP = "0123456789abcdefghijKLMNO";
    private static final long CHUNK = 10;

    @TempDir
    Path dir;
    final FakeCommands aws = new FakeCommands();
    final Fixtures.Recorder reporter = new Fixtures.Recorder();
    final Fixtures.NoSleep sleeper = new Fixtures.NoSleep();
    DatabaseConfig config;
    DumpLibrary library;
    Path current;
    Path part;

    @BeforeEach
    void setUp() throws IOException {
        config = Fixtures.config(dir);
        library = DumpLibrary.of(config, Fixtures.ZONE);
        current = library.current(Branch.HOTFIX);
        part = library.part(Branch.HOTFIX);
        aws.put(Fixtures.s3Key(Branch.HOTFIX), DUMP, TUESDAY);
        aws.put(Fixtures.s3Key(Branch.DEVELOP), "volcado de develop", TUESDAY);
        aws.put(BUCKET + "/volcados/dynamodb/Dockerfile", "FROM demo", MONDAY);
        aws.put(BUCKET + "/volcados/dynamodb/dynamo-db-dump.tar.bz2", "dynamo", MONDAY);
    }

    private S3Download download() {
        return new S3Download(aws, config, library, reporter, sleeper, CHUNK);
    }

    private void run(boolean chunked, boolean force, Branch... branches) throws Exception {
        download().run(List.of(branches), chunked, force);
    }

    private List<String> getObjects() {
        return aws.lines("aws").stream().filter(l -> l.contains("get-object")).toList();
    }

    private Path workDir() {
        return Path.of(config.workDir());
    }

    @Test
    void bd21_bd23_downloads_the_dump_of_the_branch_in_blocks_that_demand_the_same_object() throws Exception {
        run(true, false, Branch.HOTFIX);
        String etag = aws.objects.get(Fixtures.s3Key(Branch.HOTFIX)).etag();
        String chunk = library.partChunk(Branch.HOTFIX).toString();
        assertThat(aws.commands.get(0).args()).containsExactly("aws", "s3api", "head-object", "--bucket", BUCKET, "--key",
                "volcados/BBDD_hotfix_remoto.tar.gz", "--output", "json");
        assertThat(aws.commands.subList(1, 4)).extracting(Command::args).containsExactly(
                List.of("aws", "s3api", "get-object", "--bucket", BUCKET, "--key", "volcados/BBDD_hotfix_remoto.tar.gz", "--range",
                        "bytes=0-9", "--if-match", etag, chunk),
                List.of("aws", "s3api", "get-object", "--bucket", BUCKET, "--key", "volcados/BBDD_hotfix_remoto.tar.gz", "--range",
                        "bytes=10-19", "--if-match", etag, chunk),
                List.of("aws", "s3api", "get-object", "--bucket", BUCKET, "--key", "volcados/BBDD_hotfix_remoto.tar.gz", "--range",
                        "bytes=20-24", "--if-match", etag, chunk));
        assertThat(Files.readString(current)).isEqualTo(DUMP);
        assertThat(current).isEqualTo(workDir().resolve("BBDD_hotfix_local.tar.gz"));
    }

    @Test
    void bd25_the_dump_takes_the_date_of_the_object_and_nothing_temporary_is_left() throws Exception {
        run(true, false, Branch.HOTFIX);
        assertThat(Files.getLastModifiedTime(current).toInstant()).isEqualTo(TUESDAY);
        assertThat(part).doesNotExist();
        assertThat(library.partMetaFile(Branch.HOTFIX)).doesNotExist();
        assertThat(library.partChunk(Branch.HOTFIX)).doesNotExist();
    }

    @Test
    void bd27_reports_the_bytes_downloaded_and_the_total() throws Exception {
        run(true, false, Branch.HOTFIX);
        assertThat(reporter.progress).containsSubsequence("0/25", "10/25", "20/25", "25/25");
        assertThat(reporter.messages).contains("Volcado de hotfix: bloque 1 de 3", "Volcado de hotfix: bloque 3 de 3",
                "Descarga terminada");
    }

    @Test
    void bd22_the_same_dump_is_not_downloaded_again_nor_rotated() throws Exception {
        run(true, false, Branch.HOTFIX);
        Fixtures.write(library.backups(Branch.HOTFIX).resolve("auto-20261102-080000.tar.gz"), "lunes", MONDAY);
        aws.commands.clear();

        run(true, false, Branch.HOTFIX);
        assertThat(getObjects()).isEmpty();
        assertThat(reporter.log).contains("Ya tienes el último volcado de hotfix: no se descarga");
        assertThat(library.list(Branch.HOTFIX).previous().file()).isEqualTo("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd22_forcing_downloads_it_again_and_replaces_it_without_rotating() throws Exception {
        run(true, false, Branch.HOTFIX);
        Fixtures.write(library.backups(Branch.HOTFIX).resolve("auto-20261102-080000.tar.gz"), "lunes", MONDAY);
        Fixtures.write(current, "0123456789abcdefghij_ROTO", TUESDAY);
        aws.commands.clear();

        run(true, true, Branch.HOTFIX);
        assertThat(getObjects()).hasSize(3);
        assertThat(Files.readString(current)).isEqualTo(DUMP);
        assertThat(library.list(Branch.HOTFIX).previous().file()).as("la copia anterior de verdad sigue ahí")
                .isEqualTo("auto-20261102-080000.tar.gz");
    }

    @Test
    void bd31_a_new_dump_rotates_the_one_that_was_there() throws Exception {
        run(true, false, Branch.HOTFIX);
        aws.put(Fixtures.s3Key(Branch.HOTFIX), "el volcado del miércoles", WEDNESDAY);
        run(true, false, Branch.HOTFIX);
        assertThat(Files.readString(current)).isEqualTo("el volcado del miércoles");
        assertThat(Files.getLastModifiedTime(current).toInstant()).isEqualTo(WEDNESDAY);
        Path previous = library.backups(Branch.HOTFIX).resolve("auto-20261103-083000.tar.gz");
        assertThat(Files.readString(previous)).isEqualTo(DUMP);
    }

    @Test
    void bd22_a_dump_left_by_the_old_scripts_is_recognised_as_the_current_one() throws Exception {
        // Mismo sitio que usaban los scripts, con la fecha de cuando se descargó: no coincide con la del objeto.
        Fixtures.write(current, "volcado antiguo", MONDAY);
        run(true, false, Branch.HOTFIX);
        assertThat(Files.readString(current)).isEqualTo(DUMP);
        assertThat(Files.readString(library.backups(Branch.HOTFIX).resolve("auto-20261102-080000.tar.gz"))).isEqualTo("volcado antiguo");
    }

    @Test
    void bd24_resumes_a_download_left_halfway_if_the_object_is_the_same() throws Exception {
        Files.writeString(part, DUMP.substring(0, 10));
        library.writePartMeta(Branch.HOTFIX, new DumpLibrary.PartMeta(aws.objects.get(Fixtures.s3Key(Branch.HOTFIX)).etag(), 25));
        run(true, false, Branch.HOTFIX);
        assertThat(getObjects()).hasSize(2);
        assertThat(getObjects().get(0)).contains("--range bytes=10-19");
        assertThat(reporter.log).contains("Se reanuda la descarga a medias: 10 de 25 bytes");
        assertThat(Files.readString(current)).isEqualTo(DUMP);
    }

    @Test
    void bd24_resumes_from_any_byte_even_in_the_middle_of_a_block() throws Exception {
        Files.writeString(part, DUMP.substring(0, 13));
        library.writePartMeta(Branch.HOTFIX, new DumpLibrary.PartMeta(aws.objects.get(Fixtures.s3Key(Branch.HOTFIX)).etag(), 25));
        run(true, false, Branch.HOTFIX);
        assertThat(getObjects().get(0)).contains("--range bytes=13-22");
        assertThat(getObjects().get(1)).contains("--range bytes=23-24");
        assertThat(Files.readString(current)).isEqualTo(DUMP);
    }

    @Test
    void bd24_discards_what_was_downloaded_if_the_object_changed_or_nothing_is_known_about_it() throws Exception {
        // De otro volcado: mezclarlos daría un fichero corrupto.
        Files.writeString(part, "XXXXXXXXXX");
        library.writePartMeta(Branch.HOTFIX, new DumpLibrary.PartMeta("\"etag-de-otro-volcado\"", 25));
        run(true, false, Branch.HOTFIX);
        assertThat(reporter.log).contains("La descarga a medias no es de este volcado: se descarta y se empieza de cero");
        assertThat(getObjects()).hasSize(3);
        assertThat(Files.readString(current)).isEqualTo(DUMP);

        // Sin datos del objeto (como las que dejaban los scripts): tampoco se reanuda.
        aws.put(Fixtures.s3Key(Branch.HOTFIX), "0123456789abcdefghijNUEVO", WEDNESDAY);
        Files.writeString(part, "XXXXXXXXXX");
        run(true, false, Branch.HOTFIX);
        assertThat(Files.readString(current)).isEqualTo("0123456789abcdefghijNUEVO");
    }

    @Test
    void bd23_a_block_is_retried_after_waiting_ten_seconds() throws Exception {
        aws.failingChunks.set(2);
        run(true, false, Branch.HOTFIX);
        assertThat(getObjects()).hasSize(5);
        assertThat(sleeper.sleeps).containsExactly(S3Download.RETRY_WAIT, S3Download.RETRY_WAIT);
        assertThat(S3Download.RETRY_WAIT.toSeconds()).isEqualTo(10);
        assertThat(S3Download.CHUNK_BYTES).isEqualTo(100L * 1024 * 1024);
        assertThat(Files.readString(current)).isEqualTo(DUMP);
    }

    @Test
    void bd23_a_block_of_the_wrong_size_is_not_added() throws Exception {
        aws.shortChunks.set(1);
        run(true, false, Branch.HOTFIX);
        assertThat(reporter.log).anyMatch(l -> l.startsWith("ERROR: el bloque mide 9 bytes y se esperaban 10"));
        assertThat(Files.readString(current)).isEqualTo(DUMP);
    }

    @Test
    void bd23_bd25_after_ten_attempts_it_fails_and_keeps_what_was_downloaded_and_the_current_dump() throws Exception {
        Fixtures.write(current, "volcado del lunes", MONDAY);
        // El primer bloque llega bien y el segundo falla siempre.
        aws.failing = c -> c.args().contains("bytes=10-19");

        assertThatThrownBy(() -> run(true, false, Branch.HOTFIX)).isInstanceOf(StepFailed.class)
                .hasMessageContaining("volcado de hotfix").hasMessageContaining("no se pudo descargar el bloque 2 de 3");
        assertThat(getObjects()).hasSize(1 + S3Download.MAX_ATTEMPTS);
        assertThat(sleeper.sleeps).hasSize(S3Download.MAX_ATTEMPTS - 1);
        assertThat(Files.readString(part)).as("lo descargado se conserva").isEqualTo(DUMP.substring(0, 10));
        assertThat(library.readPartMeta(Branch.HOTFIX).size()).isEqualTo(25);
        assertThat(Files.readString(current)).as("el volcado actual no se toca").isEqualTo("volcado del lunes");
        assertThat(library.list(Branch.HOTFIX).previous()).isNull();

        // La siguiente ejecución sigue donde quedó.
        aws.failing = c -> false;
        aws.commands.clear();
        run(true, false, Branch.HOTFIX);
        assertThat(getObjects()).hasSize(2);
        assertThat(Files.readString(current)).isEqualTo(DUMP);
    }

    @Test
    void bd26_the_direct_mode_is_a_single_call_to_a_part_file() throws Exception {
        Files.writeString(part, "restos de otra descarga");
        library.writePartMeta(Branch.HOTFIX, new DumpLibrary.PartMeta("\"x\"", 1));
        run(false, false, Branch.HOTFIX);
        assertThat(getObjects()).isEmpty();
        assertThat(aws.commands.get(1).args()).containsExactly("aws", "s3", "cp",
                "s3://" + BUCKET + "/volcados/BBDD_hotfix_remoto.tar.gz", part.toString());
        assertThat(Files.readString(current)).isEqualTo(DUMP);
        assertThat(Files.getLastModifiedTime(current).toInstant()).isEqualTo(TUESDAY);
        assertThat(part).doesNotExist();
        assertThat(library.partMetaFile(Branch.HOTFIX)).doesNotExist();
        // BD-27: en este modo el progreso es el texto de la propia CLI.
        assertThat(reporter.messages).anyMatch(m -> m.startsWith("Completed 1 Bytes/25 Bytes"));
    }

    @Test
    void bd26_if_the_direct_download_fails_the_current_dump_stays() throws Exception {
        Fixtures.write(current, "volcado del lunes", MONDAY);
        aws.failing = c -> c.args().contains("cp") && c.args().get(3).endsWith("BBDD_hotfix_remoto.tar.gz");
        assertThatThrownBy(() -> run(false, false, Branch.HOTFIX)).isInstanceOf(StepFailed.class)
                .hasMessageContaining("la descarga directa falló");
        assertThat(Files.readString(current)).isEqualTo("volcado del lunes");
        assertThat(library.list(Branch.HOTFIX).previous()).isNull();
    }

    @Test
    void bd28_downloads_the_two_dynamodb_files_after_the_dumps() throws Exception {
        Fixtures.write(workDir().resolve("dynamodb/Dockerfile"), "FROM antiguo", MONDAY);
        run(true, false, Branch.HOTFIX);
        assertThat(Files.readString(workDir().resolve("dynamodb/Dockerfile"))).isEqualTo("FROM demo");
        assertThat(Files.readString(workDir().resolve("dynamodb/dynamo-db-dump.tar.bz2"))).isEqualTo("dynamo");
        int count = aws.commands.size();
        assertThat(aws.commands.subList(count - 2, count)).extracting(Command::args).containsExactly(
                List.of("aws", "s3", "cp", "s3://" + BUCKET + "/volcados/dynamodb/Dockerfile",
                        workDir().resolve("dynamodb/Dockerfile.part").toString()),
                List.of("aws", "s3", "cp", "s3://" + BUCKET + "/volcados/dynamodb/dynamo-db-dump.tar.bz2",
                        workDir().resolve("dynamodb/dynamo-db-dump.tar.bz2.part").toString()));
        assertThat(workDir().resolve("dynamodb/Dockerfile.part")).doesNotExist();
    }

    @Test
    void bd28_a_file_that_fails_keeps_the_one_that_was_there() throws Exception {
        Fixtures.write(workDir().resolve("dynamodb/Dockerfile"), "FROM antiguo", MONDAY);
        aws.objects.remove(BUCKET + "/volcados/dynamodb/Dockerfile");
        assertThatThrownBy(() -> run(true, false, Branch.HOTFIX)).isInstanceOf(StepFailed.class)
                .hasMessageContaining("dynamodb/Dockerfile");
        assertThat(Files.readString(workDir().resolve("dynamodb/Dockerfile"))).isEqualTo("FROM antiguo");
        // BD-29: lo demás se descargó.
        assertThat(Files.readString(current)).isEqualTo(DUMP);
        assertThat(Files.readString(workDir().resolve("dynamodb/dynamo-db-dump.tar.bz2"))).isEqualTo("dynamo");
    }

    @Test
    void bd21_bd29_with_both_branches_hotfix_goes_first_and_one_failure_does_not_stop_the_other() throws Exception {
        aws.objects.remove(Fixtures.s3Key(Branch.HOTFIX));
        assertThatThrownBy(() -> run(true, false, Branch.HOTFIX, Branch.DEVELOP)).isInstanceOf(StepFailed.class)
                .hasMessageStartingWith("No se pudo descargar: volcado de hotfix (no se pudo consultar el objeto en S3");
        assertThat(aws.commands.get(0).args()).contains("volcados/BBDD_hotfix_remoto.tar.gz");
        assertThat(aws.commands.get(1).args()).contains("volcados/BBDD_develop_remoto.tar.gz");
        assertThat(current).doesNotExist();
        assertThat(Files.readString(library.current(Branch.DEVELOP))).isEqualTo("volcado de develop");
        assertThat(Files.readString(workDir().resolve("dynamodb/Dockerfile"))).isEqualTo("FROM demo");
    }

    @Test
    void bd20_only_reads_from_s3_and_never_handles_credentials() throws Exception {
        run(true, false, Branch.HOTFIX, Branch.DEVELOP);
        run(false, true, Branch.HOTFIX);
        assertThat(aws.commands).isNotEmpty().allSatisfy(c -> {
            assertThat(c.program()).isEqualTo("aws");
            assertThat(c.env()).as("sin credenciales ni variables propias").isEmpty();
            assertThat(c.stdin()).isNull();
            List<String> args = c.args();
            String action = args.get(1) + " " + args.get(2);
            assertThat(action).isIn("s3api head-object", "s3api get-object", "s3 cp");
            if (action.equals("s3 cp")) {
                assertThat(args).hasSize(5);
                assertThat(args.get(3)).as("origen").startsWith("s3://" + BUCKET + "/");
                assertThat(args.get(4)).as("destino local").startsWith(config.workDir());
            }
        });
    }

    @Test
    void bd19_without_the_aws_command_it_says_so() {
        aws.missing.add("aws");
        assertThatThrownBy(() -> run(true, false, Branch.HOTFIX)).isInstanceOf(StepFailed.class)
                .hasMessageContaining("No se encontró el comando «aws»");
    }

    @Test
    void bd22_understands_the_dates_of_old_and_new_versions_of_the_cli() {
        Instant expected = Instant.parse("2026-11-03T08:30:00Z");
        assertThat(S3Download.instant("2026-11-03T08:30:00+00:00")).isEqualTo(expected);
        assertThat(S3Download.instant("2026-11-03T09:30:00+01:00")).isEqualTo(expected);
        assertThat(S3Download.instant("2026-11-03T08:30:00Z")).isEqualTo(expected);
        assertThat(S3Download.instant("Tue, 03 Nov 2026 08:30:00 GMT")).isEqualTo(expected);
    }
}
