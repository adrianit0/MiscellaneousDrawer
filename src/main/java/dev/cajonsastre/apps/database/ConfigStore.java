package dev.cajonsastre.apps.database;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.PrivateFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** BD-01: la configuración en {@code <config>/apps/database/config.json}, con permisos 600 (S-20). */
final class ConfigStore {

    private static final Logger log = LoggerFactory.getLogger(ConfigStore.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path file;
    private volatile DatabaseConfig current;

    ConfigStore(Path file) {
        this.file = file;
        this.current = load(file);
    }

    private static DatabaseConfig load(Path file) {
        if (!Files.isRegularFile(file)) {
            return DatabaseConfig.EMPTY;
        }
        try {
            DatabaseConfig config = JSON.readValue(file.toFile(), DatabaseConfig.class);
            // Un fichero tocado a mano pasa por la misma validación que el formulario.
            config.validate();
            return config;
        } catch (IOException | RuntimeException e) {
            // S-21: sin el contenido.
            log.warn("La configuración de la mini app database no se puede leer o no es válida: se parte de una vacía ({})",
                    e.getClass().getSimpleName());
            return DatabaseConfig.EMPTY;
        }
    }

    DatabaseConfig get() {
        return current;
    }

    synchronized void save(DatabaseConfig config) throws IOException {
        PrivateFile.writeJson(file, JSON, config);
        current = config;
    }
}
