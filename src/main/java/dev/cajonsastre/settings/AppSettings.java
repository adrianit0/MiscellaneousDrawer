package dev.cajonsastre.settings;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** config.json (D-05). Sin fichero, o con uno ilegible o fuera de rango, valen los valores por defecto. */
public final class AppSettings {

    private static final ObjectMapper JSON = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private static final Logger log = LoggerFactory.getLogger(AppSettings.class);

    private final Path file;
    private volatile AppConfig current;

    /** @param file null para no guardar nada en disco */
    public AppSettings(Path file) {
        this.file = file;
        this.current = load(file);
    }

    public AppConfig get() {
        return current;
    }

    public synchronized AppConfig update(AppConfig config) {
        config.validate();
        if (file != null) {
            try {
                Path dir = file.toAbsolutePath().getParent();
                Files.createDirectories(dir);
                Path tmp = Files.createTempFile(dir, "config", ".tmp");
                try {
                    JSON.writeValue(tmp.toFile(), config);
                    Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } finally {
                    Files.deleteIfExists(tmp);
                }
            } catch (IOException e) {
                throw new UncheckedIOException("No se pudieron guardar los ajustes", e);
            }
        }
        current = config;
        return config;
    }

    private static AppConfig load(Path file) {
        if (file == null || !Files.exists(file)) {
            return AppConfig.DEFAULT;
        }
        try {
            return JSON.readValue(file.toFile(), AppConfig.class).validate();
        } catch (IOException | RuntimeException e) {
            log.warn("config.json no es válido; se usan los ajustes por defecto: {}", e.getMessage());
            return AppConfig.DEFAULT;
        }
    }
}
