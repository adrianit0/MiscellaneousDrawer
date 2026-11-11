# Sprint 2: Actualización desde GitHub

## Objetivo

Que un push a `master` deje disponible una versión nueva, y que la aplicación la busque e instale con dos botones, sin compilar ni copiar el JAR a mano. Es el actualizador de LiteDD, adaptado a Cajón de sastre.

## Requisitos cubiertos

- Actualizaciones: R-01 a R-47.
- Cambios en S-15, S-34, U-06, U-07, D-05, la API, la arquitectura y la constitución (principio 4).

Documentos: [requisitos/actualizaciones.md](../requisitos/actualizaciones.md), [ADR-0010](../decisiones/ADR-0010-actualizacion-desde-github.md), [constitucion.md](../constitucion.md).

## Tareas

1. Especificación: requisitos R, ADR-0010, principio 4 de la constitución y cambios en seguridad, interfaz, datos, API, arquitectura, ADR-0009 y `CLAUDE.md`.
2. Paso del usuario: generar el par de claves fuera del repositorio y guardar la privada en el secreto `CAJONSASTRE_RELEASE_KEY`. La pública va a `release-key.pub`.
3. Publicación: `.github/workflows/release.yml` (R-01, R-05) y `scripts/release.sh` (R-02 a R-04).
4. Servidor, paquete `dev.cajonsastre.update`:
   - `UpdateUrls`, `UpdateManifest`, `UpdateClient` e `Installation` (R-11, R-14, R-20 a R-24, R-30 a R-32, R-42).
   - `UpdateHelper`, `Updater` y `UpdateApi` (R-13, R-43, R-44).
   - Ajuste `updateRepository` en `config.json` (R-11, D-05).
5. Interfaz:
   - Categoría «Actualizaciones» con la versión, la URL y los botones (R-10 a R-14).
   - Confirmación con el build y los commits (R-40).
   - Guardado de los estados pendientes de las mini apps antes de confirmar (R-41).
   - Recarga de la ventana al volver con otro build (R-45).
6. Documentación: `README.md` (qué se conecta y cómo actualizar) y `CLAUDE.md`.
7. Verificación: `./mvnw verify` en verde, criterios de aceptación con la aplicación arrancada y, tras el push, el workflow en GitHub y una actualización real en Ubuntu.

## Criterios de aceptación

- `./mvnw verify` termina en verde.
- Un push con una prueba rota no publica nada.
- Un push correcto publica `build-N` con `cajonsastre.jar`, `latest.json` y `latest.json.sig`. Un push que solo cambia `specs/` no publica.
- Sin una URL guardada no hay ninguna conexión a GitHub, ni al arrancar ni al abrir «Ajustes».
- «Guardar» rechaza una URL que no sea de un repositorio de `github.com`.
- «Buscar actualizaciones» dice «Tienes la última versión» o muestra build, fecha, commit y commits.
- Se rechazan, y la aplicación sigue igual: una firma ajena, también la de una release de otro repositorio, un manifiesto alterado, un build anterior, un JAR con otro hash y una redirección a otro host.
- Si el estado de una mini app no se puede guardar, «Actualizar» no continúa y dice por qué.
- En Ubuntu, «Actualizar» reinicia la aplicación, la ventana se recarga sola, se ve el build nuevo y los datos siguen intactos.
- Un JAR que no arranca devuelve la aplicación a la versión anterior y queda explicado en `update.log`.
- En desarrollo y en Windows, la categoría indica el motivo y no ofrece los botones.

## Resultado

Fecha: 2026-11-09. Hecho en el código; falta el primer push, que publicará `build-1`, y una actualización real en Ubuntu.

### Hecho

- **Especificación:** requisitos R-01 a R-47 en `requisitos/actualizaciones.md` y ADR-0010 aceptado. El principio 4 de la constitución pasa a ser una lista cerrada de destinos autorizados, con GitHub solo para el actualizador del shell. Cambios en S-15, S-34, U-06, U-07, D-05, la API, la ruta de `update.log`, la arquitectura, ADR-0009 y `CLAUDE.md`, que añade el prefijo R.
- **Clave:** el usuario generó un par Ed25519 propio, distinto del de LiteDD, y guardó la privada en el secreto `CAJONSASTRE_RELEASE_KEY`. La pública está en `src/main/resources/dev/cajonsastre/update/release-key.pub`.
- **Publicación:** `.github/workflows/release.yml` (push a `master`, `ubuntu-22.04`, acciones fijadas por hash, solo `contents: write`) y `scripts/release.sh`, que comprueba la clave contra la pública antes de firmar y publicar.
- **Servidor (`dev.cajonsastre.update`):** `UpdateUrls`, `UpdateManifest`, `UpdateClient`, `Installation`, `UpdateHelper`, `Updater` y `UpdateApi`, más el ajuste `updateRepository` en `config.json`. El proceso `sh` ya incluye la corrección del lanzador de jpackage.
- **Interfaz:**
  - Categoría «Actualizaciones» en «Ajustes», después de «General».
  - Confirmación con el build, el commit y los commits.
  - Guardado previo de los estados de las mini apps, que bloquea la actualización si alguno falla.
  - Recarga de la ventana al volver con otro build, o aviso si vuelve el mismo.
- **Pruebas:** 174 de backend y 157 de interfaz.
  - En Windows se omiten 16 de backend, las que necesitan `sh`: las 6 de sprints anteriores, las 7 de `UpdateHelperTest` y las 3 de `ReleaseTest` que ejecutan el script.
  - Pruebas nuevas: `UpdateUrlsTest`, `UpdateManifestTest`, `UpdateClientTest`, `UpdaterTest`, `UpdateHelperTest`, `ReleaseTest`, 2 de `SettingsTest` y 1 de `AppBoundariesTest`, `UpdateSettings.test.tsx` y `presence.test.ts`.

### Criterios de aceptación

1. **`./mvnw verify` en verde:** en Windows 10. **Cumplido.**
2. **Un push con una prueba rota no publica:** el workflow ejecuta `verify` antes de publicar. **No ha ocurrido todavía.**
3. **Un push correcto publica los tres ficheros, y uno que solo cambia `specs/` no publica:**
   - `ReleaseTest` comprueba el disparador y `paths-ignore`.
   - `scripts/release.sh` se ejecutó en Git Bash con una clave de prueba desechable: generó `latest.json` con los commits desde la release anterior, y `openssl` verificó la firma.
   - El primer push ejecutó el workflow y «Pruebas y JAR» pasó en `ubuntu-22.04`. «Publicar» falló porque `openssl` no pudo leer el secreto, aunque el fichero `.pem` del usuario es válido.
   - Un push posterior que solo cambiaba `CLAUDE.md` no generó ninguna ejecución.
   - **Pendiente de volver a guardar el secreto.**
4. **Sin URL no hay conexión:** pruebas R-11 y R-12. **Cumplido en pruebas.**
5. **«Guardar» rechaza otra URL:** con el JAR arrancado y datos aislados, `https://evil.example/demo/app` deja «Ajustes» abierto con el motivo, y `https://github.com/demo/app` se guarda en `config.json`. **Cumplido.**
6. **Búsqueda:** pruebas R-13. **Cumplido en pruebas**; la búsqueda real espera a la primera release.
7. **Rechazos** (firma ajena, manifiesto alterado, build anterior, otro hash, redirección a otro host): pruebas R-20, R-21 y R-30 a R-32. **Cumplido en pruebas.**
8. **Estado de una mini app sin guardar:** pruebas R-41. **Cumplido en pruebas.**
9. **Actualización real en Ubuntu:** **pendiente.**
10. **Vuelta atrás:** `UpdateHelperTest` solo corre en Linux y forma parte del paso «Pruebas y JAR», que pasó en el CI. **Cumplido en pruebas.**
11. **Desarrollo y Windows:** con el JAR, la categoría muestra «Las actualizaciones solo funcionan en la instalación de Ubuntu.» sin botones, `POST /api/update/check` y `POST /api/update/apply` responden 409 sin conectar, y sin token, 403. **Cumplido.**

### Pendiente

- **Secreto `CAJONSASTRE_RELEASE_KEY`:** volver a guardarlo con el fichero `.pem` entero y repetir la publicación. Las 16 pruebas que en Windows se omiten ya pasaron en Linux con el primer push.
- **Primera instalación manual en Ubuntu:** `scripts/install.sh cajonsastre.jar` con el JAR de `build-1`, guardar la URL del repositorio en «Ajustes» y, con un segundo push, actualizar con los botones.
- **Verificación del Sprint 1 en Ubuntu:** sigue sin confirmar, y ADR-0009 sigue como «propuesta».

### Desviaciones y decisiones

- **ADR-0010 (aceptada):** actualizador de LiteDD con clave propia, rama `master`, R-41 adaptado a los estados de las mini apps y la corrección del lanzador de jpackage desde el principio.
- **La confirmación es un diálogo sobre «Ajustes»:** su botón se llama «Actualizar ahora» para distinguirlo del de la categoría. Esc cierra solo la confirmación. Al confirmar, «Ajustes» se cierra y un aviso dice que la ventana se recargará sola.
- **Las pruebas cubren también la publicación:** `ReleaseTest` comprueba el workflow y el script en todos los sistemas, y en Linux ejecuta el script en un proyecto mínimo con su propia clave, sin publicar nada.
- **Clave pública:** se obtuvo del fichero del usuario con `openssl pkey -pubout`, que solo emite la parte pública. La privada no pasó por el código ni por el registro.
- **R-04 ampliado tras el primer push:** el error «Could not read key» no decía qué tenía el secreto. Ahora `scripts/release.sh` tolera `\r` y espacios en los extremos de las líneas, y distingue cuatro casos sin mostrar el secreto: falta, no es un PEM, es la clave pública o no corresponde a la del repositorio. Tres pruebas nuevas de `ReleaseTest`, solo en Linux.
