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

Pendiente.
