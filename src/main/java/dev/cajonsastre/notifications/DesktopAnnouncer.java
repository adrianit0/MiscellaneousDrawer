package dev.cajonsastre.notifications;

import dev.cajonsastre.settings.AppConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * P-24: anuncia una notificación fuera de la ventana, con {@code notify-send} y {@code paplay}, según los ajustes. Los
 * comandos se lanzan sin esperarlos; si no existen o fallan, no pasa nada.
 */
public final class DesktopAnnouncer {

    /** El sonido de finalización del tema de sonidos de freedesktop. */
    public static final String SOUND = "/usr/share/sounds/freedesktop/stereo/complete.oga";
    private static final Logger log = LoggerFactory.getLogger(DesktopAnnouncer.class);

    private final Supplier<AppConfig> config;
    private final Consumer<List<String>> launcher;

    public DesktopAnnouncer(Supplier<AppConfig> config) {
        this(config, DesktopAnnouncer::launch);
    }

    /** Para las pruebas: con un lanzador de comandos simulado. */
    DesktopAnnouncer(Supplier<AppConfig> config, Consumer<List<String>> launcher) {
        this.config = config;
        this.launcher = launcher;
    }

    public void announce(String appName, String title) {
        AppConfig current = config.get();
        if (current.desktopNotifications()) {
            run(List.of("notify-send", appName, title));
        }
        if (current.notificationSound()) {
            run(List.of("paplay", SOUND));
        }
    }

    private void run(List<String> command) {
        try {
            launcher.accept(command);
        } catch (RuntimeException e) {
            // S-21: solo el nombre del comando.
            log.debug("No se pudo lanzar {}: {}", command.get(0), e.getClass().getSimpleName());
        }
    }

    static void launch(List<String> command) {
        ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD);
        // Las variables del lanzador de jpackage rompen los comandos del sistema (BD-19).
        builder.environment().remove("_JPACKAGE_LAUNCHER");
        builder.environment().remove("LD_LIBRARY_PATH");
        try {
            builder.start().getOutputStream().close();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
