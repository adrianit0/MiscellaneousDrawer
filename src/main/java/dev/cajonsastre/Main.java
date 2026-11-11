package dev.cajonsastre;

import dev.cajonsastre.catalog.AppCatalog;
import dev.cajonsastre.catalog.AppRegistry;
import dev.cajonsastre.catalog.AppStateApi;
import dev.cajonsastre.catalog.CatalogApi;
import dev.cajonsastre.http.HttpServer;
import dev.cajonsastre.http.LocalSecurity;
import dev.cajonsastre.lifecycle.CommandLine;
import dev.cajonsastre.lifecycle.CommandLine.Options;
import dev.cajonsastre.lifecycle.Desktop;
import dev.cajonsastre.lifecycle.InstanceFile;
import dev.cajonsastre.lifecycle.LifecycleApi;
import dev.cajonsastre.lifecycle.Presence;
import dev.cajonsastre.platform.Store;
import dev.cajonsastre.settings.AppSettings;
import dev.cajonsastre.settings.SettingsApi;
import dev.cajonsastre.update.UpdateApi;
import dev.cajonsastre.update.Updater;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Punto de entrada y ciclo de vida (C-01 a C-10): instancia única, mini apps, ventana, presencia y apagado ordenado.
 * Opciones: cajonsastre [--no-window] [--port N] | cajonsastre --stop.
 */
public final class Main {

    /** Solo para desarrollo: scripts/dev.sh comparte el token con Vite (ADR-0003). */
    static final String DEV_TOKEN_ENV = "CAJONSASTRE_DEV_TOKEN";

    static {
        // C-09: el registro va a ~/.local/state/cajonsastre; tiene que fijarse antes del primer logger.
        System.setProperty("cajonsastre.logdir", DataPaths.stateDir().toString());
    }

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    private Main() {
    }

    public static void main(String[] args) {
        Options options;
        try {
            options = CommandLine.parse(args);
        } catch (IllegalArgumentException e) {
            // C-07
            System.err.println(e.getMessage());
            System.err.println(CommandLine.USAGE);
            System.exit(2);
            return;
        }
        InstanceFile instance = new InstanceFile(DataPaths.instanceFile());
        if (options.stop()) {
            System.exit(stop(instance));
            return;
        }

        AppSettings settings = new AppSettings(DataPaths.configFile());
        int port = options.port() != null ? options.port() : settings.get().port();
        String url = "http://" + HttpServer.HOST + ":" + port + "/";

        // C-01: si ya hay una instancia de CajonSastre, solo se abre la ventana.
        if (isRunning(port)) {
            System.out.println("Cajón de sastre ya está en marcha en " + url);
            if (!options.noWindow()) {
                Desktop.openWindow(url, DataPaths.chromeProfile());
            }
            return;
        }
        start(port, url, settings, instance, options.noWindow());
    }

    private static void start(int port, String url, AppSettings settings, InstanceFile instance, boolean noWindow) {
        Clock clock = Clock.systemUTC();
        // C-02: base del shell, mini apps y servidor.
        Store store;
        try {
            store = ShellDatabase.open(DataPaths.shellDatabase(), DataPaths.backups());
        } catch (RuntimeException e) {
            // D-03: sin la base del shell no se arranca.
            System.err.println("No se pudo abrir la base de datos: " + e.getMessage());
            log.error("No se pudo abrir la base del shell", e);
            System.exit(1);
            return;
        }
        AppCatalog catalog = AppCatalog.builtIn();
        AppRegistry registry = AppRegistry.start(catalog, DataPaths.appPaths(), clock);

        String token = sessionToken();
        AtomicBoolean stopped = new AtomicBoolean();
        Holder<HttpServer> server = new Holder<>();
        Holder<Presence> presence = new Holder<>();

        // C-10: sincronizado; si el apagado empieza en un hilo y la JVM sale entretanto, el gancho espera.
        Runnable shutdown = () -> {
            synchronized (stopped) {
                if (stopped.get()) {
                    return;
                }
                stopAll(server.value, registry, store, instance, presence.value);
                stopped.set(true);
            }
        };
        Runnable exit = () -> {
            shutdown.run();
            System.exit(0);
        };
        presence.value = new Presence(exit, Presence.BYE_GRACE, () -> {
            Integer minutes = settings.get().autoShutdownMinutes();
            return minutes == null ? null : Duration.ofMinutes(minutes);
        }, registry::busy);

        try {
            server.value = new HttpServer(port, token, List.of(
                    new SettingsApi(store, settings),
                    new CatalogApi(registry),
                    new AppStateApi(store, catalog, clock),
                    new LifecycleApi(presence.value, exit),
                    // R-12: solo conecta cuando la interfaz llama a sus rutas.
                    new UpdateApi(Updater.installed(() -> settings.get().updateRepository(), port), exit, registry::busy),
                    registry)).start();
        } catch (RuntimeException e) {
            // C-02
            System.err.println("No se pudo escuchar en el puerto " + port + " (¿lo usa otra aplicación?): " + e.getMessage());
            shutdown.run();
            System.exit(1);
            return;
        }
        instance.write(port, token);
        Runtime.getRuntime().addShutdownHook(new Thread(shutdown, "cajonsastre-shutdown"));

        log.info("{} {} escuchando en {}", AppInfo.NAME, AppInfo.VERSION, url);
        if (!noWindow) {
            // C-03
            Desktop.openWindow(url, DataPaths.chromeProfile());
        }
    }

    private static void stopAll(HttpServer server, AppRegistry registry, Store store, InstanceFile instance,
                                Presence presence) {
        log.info("Apagando CajonSastre");
        if (server != null) {
            server.stop();
        }
        registry.close();
        store.close();
        instance.delete();
        if (presence != null) {
            presence.close();
        }
        log.info("CajonSastre apagado");
    }

    /** C-01: ¿responde CajonSastre en ese puerto? La firma de LiteDD u otra aplicación no cuenta. */
    static boolean isRunning(int port) {
        try {
            HttpResponse<String> r = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build().send(
                    HttpRequest.newBuilder(URI.create("http://" + HttpServer.HOST + ":" + port + "/api/health"))
                            .timeout(Duration.ofSeconds(2)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            return isOwnHealth(r.statusCode(), r.body());
        } catch (Exception e) {
            return false;
        }
    }

    static boolean isOwnHealth(int status, String body) {
        return status == 200 && body != null && body.contains("\"app\":\"" + AppInfo.NAME + "\"");
    }

    /** C-06: apagado ordenado con el token del fichero de instancia. */
    static int stop(InstanceFile instance) {
        InstanceFile.Instance running = instance.read().orElse(null);
        if (running == null || !isRunning(running.port())) {
            System.out.println("Cajón de sastre no está en marcha");
            instance.delete();
            return 1;
        }
        try {
            HttpResponse<String> r = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://" + HttpServer.HOST + ":" + running.port() + "/api/shutdown"))
                            .header(LocalSecurity.TOKEN_HEADER, running.token())
                            .POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                System.err.println("Cajón de sastre no aceptó el apagado (" + r.statusCode() + ")");
                return 1;
            }
            System.out.println("Cajón de sastre se está apagando");
            return 0;
        } catch (Exception e) {
            System.err.println("No se pudo contactar con Cajón de sastre: " + e.getMessage());
            return 1;
        }
    }

    /** S-12: token aleatorio generado en cada arranque. */
    static String sessionToken() {
        String dev = System.getenv(DEV_TOKEN_ENV);
        if (dev != null && dev.length() >= 32) {
            return dev;
        }
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static final class Holder<T> {
        T value;
    }
}
