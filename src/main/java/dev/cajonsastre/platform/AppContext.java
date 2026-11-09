package dev.cajonsastre.platform;

import java.nio.file.Path;
import java.time.Clock;

/** Lo que la plataforma da a una mini app al arrancar (P-05, P-08, P-09). */
public interface AppContext {

    String appId();

    /** P-08: su base de datos, ya migrada. Falla si la mini app no declara migraciones. */
    Store store();

    /** P-09: su carpeta de ficheros, {@code <datos>/apps/<id>/}; se crea al pedirla. */
    Path dataDir();

    /** P-09: su carpeta de configuración, {@code <config>/apps/<id>/}; se crea al pedirla. Secretos con {@link PrivateFile}. */
    Path configDir();

    Clock clock();
}
