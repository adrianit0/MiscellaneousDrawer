package dev.cajonsastre.apps.resubmit;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.PrivateFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** RP-01: la conexión en {@code <config>/apps/resubmit/config.json}, con permisos 600 (S-20). */
final class ConfigStore {

    private static final Logger log = LoggerFactory.getLogger(ConfigStore.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path file;
    private volatile ResubmitConfig current;

    ConfigStore(Path file) {
        this.file = file;
        this.current = load(file);
    }

    private static ResubmitConfig load(Path file) {
        if (!Files.isRegularFile(file)) {
            return ResubmitConfig.EMPTY;
        }
        try {
            ResubmitConfig config = JSON.readValue(file.toFile(), ResubmitConfig.class);
            // Un fichero tocado a mano pasa por la misma validación que el formulario.
            config.validate();
            return config;
        } catch (IOException | RuntimeException e) {
            // S-21: sin el contenido.
            log.warn("La conexión de la mini app resubmit no se puede leer o no es válida: se parte de una vacía ({})",
                    e.getClass().getSimpleName());
            return ResubmitConfig.EMPTY;
        }
    }

    ResubmitConfig get() {
        return current;
    }

    synchronized void save(ResubmitConfig config) throws IOException {
        PrivateFile.writeJson(file, JSON, config);
        current = config;
    }
}
