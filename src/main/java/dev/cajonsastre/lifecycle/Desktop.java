package dev.cajonsastre.lifecycle;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * Ventana en el escritorio (C-03). En Linux: google-chrome --app con perfil y clase propios, o xdg-open. En otros
 * sistemas, solo para desarrollo, el navegador por defecto (ADR-0004).
 */
public final class Desktop {

    private static final Logger log = LoggerFactory.getLogger(Desktop.class);
    private static final boolean LINUX = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux");

    /** C-03, C-08: clase de ventana propia, distinta de la de LiteDD. */
    public static final String WINDOW_CLASS = "cajonsastre";

    private Desktop() {
    }

    public static void openWindow(String url, Path chromeProfile) {
        if (LINUX) {
            if (!start(chromeCommand(url, chromeProfile).toArray(String[]::new))) {
                start("xdg-open", url);
            }
            return;
        }
        try {
            java.awt.Desktop.getDesktop().browse(URI.create(url));
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo abrir la ventana: {}. Abre {} en el navegador.", e.getMessage(), url);
        }
    }

    /**
     * Un perfil propio arranca un proceso de Chrome aparte, así que la ventana no se une a un Chrome ya abierto y
     * conserva su clase; con X11 (también bajo Wayland) el escritorio la asocia a su lanzador.
     */
    static List<String> chromeCommand(String url, Path profile) {
        return List.of("google-chrome", "--app=" + url, "--class=" + WINDOW_CLASS, "--user-data-dir=" + profile,
                "--ozone-platform=x11", "--no-first-run", "--no-default-browser-check");
    }

    private static boolean start(String... command) {
        try {
            new ProcessBuilder(command).inheritIO().start();
            return true;
        } catch (IOException e) {
            log.debug("No se pudo ejecutar {}: {}", command[0], e.getMessage());
            return false;
        }
    }
}
