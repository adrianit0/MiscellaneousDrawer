package dev.cajonsastre.platform;

import java.util.List;
import java.util.Optional;

/**
 * Contrato de servidor de una mini app (P-05). Todo es opcional salvo el manifiesto: una mini app solo de
 * interfaz, o en preparación, se declara con {@link #of(AppManifest)}. El diseño completo está en
 * {@code specs/diseno/mini-apps.md}.
 */
public interface MiniApp {

    AppManifest manifest();

    /**
     * P-08: recursos de migración de su base, en orden ({@code db/apps/<id>/V001__….sql}). Vacía: la mini app no
     * tiene base de datos.
     */
    default List<String> migrations() {
        return List.of();
    }

    /** P-08: mappers de MyBatis con anotaciones de su base (D-06). */
    default List<Class<?>> mappers() {
        return List.of();
    }

    /**
     * P-05: arranque, con la base ya migrada. Declara aquí sus rutas. Si lanza, la mini app queda en {@code failed}
     * y sus rutas se descartan (P-07).
     */
    default void start(AppContext context, AppRoutes routes) throws Exception {
    }

    /** P-10: apagado; libera hilos, conexiones o ficheros abiertos. La plataforma cierra después su base. */
    default void stop() {
    }

    /**
     * P-20: el motivo por el que no conviene apagar ni actualizar ahora, apto para mostrarse («hay un trabajo en
     * marcha»); vacío si no hay ninguno. Se consulta desde otros hilos y debe responder sin esperar.
     */
    default Optional<String> busy() {
        return Optional.empty();
    }

    /** Una mini app sin servidor: solo de interfaz o en preparación. */
    static MiniApp of(AppManifest manifest) {
        return () -> manifest;
    }
}
