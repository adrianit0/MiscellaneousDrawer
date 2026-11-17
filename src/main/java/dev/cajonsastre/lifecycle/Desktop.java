package dev.cajonsastre.lifecycle;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Ventana en el escritorio (C-03). En Linux: google-chrome --app con perfil y clase propios, o xdg-open. En otros
 * sistemas, solo para desarrollo, el navegador por defecto (ADR-0004). Los enlaces externos van al Chrome habitual del
 * usuario, fuera de esa ventana (C-16).
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

    /**
     * C-16: abre un enlace en el Chrome habitual del usuario, o con {@code xdg-open} si Chrome no está. En otros
     * sistemas, solo para desarrollo, el navegador por defecto. Devuelve si se pudo lanzar.
     */
    public static boolean openLink(String url) {
        if (LINUX) {
            return launch(linkCommand(url)) || launch(List.of("xdg-open", url));
        }
        try {
            java.awt.Desktop.getDesktop().browse(URI.create(url));
            return true;
        } catch (IOException | RuntimeException e) {
            log.warn("No se pudo abrir el enlace: {}", e.getClass().getSimpleName());
            return false;
        }
    }

    /**
     * Sin {@code --app} ni {@code --user-data-dir}: Chrome usa el perfil por defecto del usuario y, si ya está abierto,
     * abre una pestaña en él en lugar de en la ventana de la aplicación (C-03).
     */
    static List<String> linkCommand(String url) {
        return List.of("google-chrome", url);
    }

    /** C-16, BD-19: las variables del lanzador de jpackage rompen los comandos del sistema. */
    static void withoutLauncherVariables(Map<String, String> environment) {
        environment.remove("_JPACKAGE_LAUNCHER");
        environment.remove("LD_LIBRARY_PATH");
    }

    private static boolean launch(List<String> command) {
        ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD);
        withoutLauncherVariables(builder.environment());
        try {
            builder.start().getOutputStream().close();
            return true;
        } catch (IOException e) {
            // S-21: solo el nombre del comando, no la URL.
            log.debug("No se pudo ejecutar {}: {}", command.get(0), e.getClass().getSimpleName());
            return false;
        }
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
