package dev.cajonsastre.apps.database;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** BD-40, BD-41: importa un volcado en un contenedor MySQL recién creado. Borra el contenedor y el volumen que hubiera. */
final class DockerImport {

    /** BD-41: lo que tarda MySQL en arrancar. */
    static final Duration START_WAIT = Duration.ofSeconds(20);
    /** Donde se monta el volcado dentro del contenedor auxiliar. */
    private static final String MOUNT = "/dump.tar.gz";

    private final CommandRunner runner;
    private final DatabaseConfig config;
    private final Reporter reporter;
    private final Sleeper sleeper;

    DockerImport(CommandRunner runner, DatabaseConfig config, Reporter reporter, Sleeper sleeper) {
        this.runner = runner;
        this.config = config;
        this.reporter = reporter;
        this.sleeper = sleeper;
    }

    void run(Path dump) throws StepFailed, IOException, InterruptedException {
        // BD-40: antes de tocar Docker.
        if (!Files.isRegularFile(dump)) {
            throw new StepFailed("El volcado " + dump.getFileName() + " no existe");
        }
        for (String path : List.of(config.initSqlFile(), config.secondInitSqlFile())) {
            if (!Files.isRegularFile(Path.of(path))) {
                throw new StepFailed("El script inicial " + path + " no existe");
            }
        }
        String container = config.containerName();
        String volume = container + "-data";

        reporter.message("Borrando el contenedor y el volumen anteriores");
        // Sus fallos se ignoran: puede que no existan.
        reporter.run(runner, Command.of("docker", "stop", container));
        reporter.run(runner, Command.of("docker", "rm", container));
        reporter.run(runner, Command.of("docker", "volume", "rm", volume));

        reporter.message("Creando el contenedor de MySQL");
        must("crear el volumen", Command.of("docker", "volume", "create", volume));
        // BD-16: la contraseña llega al cliente de docker por su entorno, y -e sin valor la pasa al contenedor.
        must("crear el contenedor", Command.of("docker", "run", "-d", "-p", config.hostPort() + ":" + config.containerPort(),
                "--name", container, "--restart", "always", "-e", "MYSQL_ROOT_PASSWORD", "-e", "TZ=" + config.timeZone(),
                "--mount", "src=" + volume + ",dst=/var/lib/mysql", config.mysqlImage(), "--lower-case-table-names=1",
                "--sql_mode=NO_ENGINE_SUBSTITUTION").withEnv("MYSQL_ROOT_PASSWORD", config.rootPassword()));
        waitForStart();

        reporter.message("Extrayendo el volcado " + dump.getFileName());
        must("parar el contenedor", Command.of("docker", "stop", container));
        must("extraer el volcado", Command.of("docker", "run", "--rm", "--volumes-from", container, "-v",
                dump.toAbsolutePath() + ":" + MOUNT + ":ro", "ubuntu", "bash", "-c",
                "cd /var/lib/mysql && tar xzvf " + MOUNT + " --strip 3"));
        must("arrancar el contenedor", Command.of("docker", "start", container));
        waitForStart();

        for (String file : List.of(config.initSqlFile(), config.secondInitSqlFile())) {
            reporter.message("Ejecutando " + Path.of(file).getFileName());
            must("ejecutar " + Path.of(file).getFileName(), mysql(config, null).withStdin(Path.of(file)));
        }
        reporter.message("Importación terminada");
    }

    /** BD-41, BD-51: el cliente mysql dentro del contenedor, con la contraseña por MYSQL_PWD (BD-16). */
    static Command mysql(DatabaseConfig config, String database) {
        List<String> args = new ArrayList<>(List.of("docker", "exec", "-i", "-e", "MYSQL_PWD", config.containerName(),
                "mysql", "--default-character-set=utf8", "-uroot"));
        if (database != null) {
            args.add(database);
        }
        return Command.of(args).withEnv("MYSQL_PWD", config.rootPassword());
    }

    private void waitForStart() throws InterruptedException {
        reporter.message("Esperando " + START_WAIT.toSeconds() + " s a que arranque MySQL");
        reporter.log("Espera de " + START_WAIT.toSeconds() + " s");
        sleeper.sleep(START_WAIT);
    }

    private void must(String what, Command command) throws StepFailed, IOException, InterruptedException {
        int code = reporter.run(runner, command);
        if (code != 0) {
            throw new StepFailed("No se pudo " + what + " (código " + code + ")");
        }
    }
}
