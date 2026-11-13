package dev.cajonsastre.apps.quality;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.cajonsastre.platform.PrivateFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** CD-01: la configuración en {@code <config>/apps/quality/config.json}, con permisos 600 (S-20). */
final class ConfigStore {

    private static final Logger log = LoggerFactory.getLogger(ConfigStore.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path file;
    private volatile QualityConfig current;

    ConfigStore(Path file) {
        this.file = file;
        this.current = load(file);
    }

    private static QualityConfig load(Path file) {
        if (!Files.isRegularFile(file)) {
            return QualityConfig.EMPTY;
        }
        try {
            QualityConfig config = JSON.readValue(file.toFile(), QualityConfig.class);
            // Un fichero tocado a mano pasa por la misma validación que el formulario.
            config.validate();
            return config;
        } catch (IOException | RuntimeException e) {
            // S-21: sin el contenido.
            log.warn("La configuración de la mini app quality no se puede leer o no es válida: se parte de una vacía ({})",
                    e.getClass().getSimpleName());
            return QualityConfig.EMPTY;
        }
    }

    QualityConfig get() {
        return current;
    }

    synchronized void save(QualityConfig config) throws IOException {
        PrivateFile.writeJson(file, JSON, config);
        current = config;
    }
}
