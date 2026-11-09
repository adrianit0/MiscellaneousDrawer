# ADR-0010: Actualización desde GitHub con un JAR firmado

- Estado: aceptada (2026-11-09)
- Requisitos: R-01 a R-47, S-15, U-06, U-07, D-05, API, arquitectura y constitución (principio 4)
- Modifica: constitución (principio 4), que pasa de una lista de destinos vacía a una lista cerrada con GitHub; ADR-0009, que dejaba las actualizaciones fuera

## Contexto

Tras el Sprint 1, llevar un cambio al equipo con Ubuntu exige volver a ejecutar `scripts/install.sh`, compilando allí o copiando el JAR (ADR-0009). LiteDD resolvió lo mismo con un actualizador probado en ese equipo (su ADR-0033, con la corrección de su ADR-0035): cada push publica en GitHub un JAR firmado y la aplicación lo busca e instala con dos botones.

Comprobaciones previas (2026-11-09):

- **Repositorio:** es público y responde en `github.com` sin credenciales. Aún no tiene releases.
- **Instalación:** las dos formas de ADR-0009 dejan un único JAR y un `bin/cajonsastre`: `lib/app/cajonsastre.jar` en la imagen de jpackage y `lib/cajonsastre.jar` con el Java del sistema. Es la misma disposición que en LiteDD.
- **Versión:** `version.properties` ya lleva `build` y `commit`, y `/api/health` ya devuelve el build.
- **Fronteras:** P-18 ya impide que el código de una mini app use un paquete del shell como el del actualizador.
- **Red, firma y descarga:** son las de LiteDD, comprobadas en el mismo equipo y la misma red.

## Decisión

El usuario pidió incluir el actualizador de LiteDD y aprobó el plan del Sprint 2 (2026-11-09). Con esa aprobación:

1. **Autoriza GitHub como destino** y confirma que tiene permiso para usarlo en el equipo con Ubuntu. El principio 4 pasa a ser una lista cerrada de destinos autorizados, que hoy solo tiene GitHub y solo para el actualizador del shell.
2. **Clave propia.** El usuario generó un par Ed25519 nuevo, distinto del de LiteDD, guardó la clave privada en el secreto `CAJONSASTRE_RELEASE_KEY` y fuera del repositorio. La pública va en `src/main/resources/dev/cajonsastre/update/release-key.pub`. Si una de las dos claves se viera comprometida, la otra aplicación no confiaría en lo firmado con ella (C-08).

Se mantiene todo lo que LiteDD decidió en su ADR-0033:

- Un botón busca y otro actualiza. La aplicación nunca se actualiza sola ni contacta con GitHub sin un gesto del usuario.
- Sin una URL guardada en «Ajustes» no hay conexión, así que sobra una casilla aparte.
- El manifiesto `latest.json` va firmado con Ed25519 y cubre el número de build y el hash del JAR.
- No hay token de GitHub, porque el repositorio es público.
- Si la versión nueva no arranca en 60 s, se restaura la anterior.

Diferencias con LiteDD:

- **Rama `master`**, la de este repositorio.
- **La corrección de su ADR-0035 desde el principio.** El proceso `sh` quita `_JPACKAGE_LAUNCHER` y `LD_LIBRARY_PATH` antes de ejecutar el lanzador, y la salida de errores del lanzador va a `update.log`. Así, el reinicio automático funciona ya en la primera actualización.
- **R-41 adaptado.** El shell no tiene pestañas ni ejecuciones en marcha. Lo que podría perderse son los estados de interfaz pendientes de las mini apps (P-14), así que se guardan antes de confirmar, y si alguno falla no se actualiza. Un mecanismo para que una mini app bloquee la actualización por su cuenta se añadirá cuando alguna lo necesite (principio 8).
- **Prefijo R** para estos requisitos, como en LiteDD. Se añade a los prefijos del shell.
- **La categoría «Actualizaciones» se guarda con el «Guardar» de «Ajustes»** (U-06), igual que «General».

Diseño:

- **Publicación:** `.github/workflows/release.yml` se dispara con cada push a `master` y ejecuta `./mvnw -Pdist verify` en `ubuntu-22.04`. Si pasa, `scripts/release.sh` genera el manifiesto, lo firma con `openssl pkeyutl -sign -rawin` y publica `build-N` con `gh`, ya instalado en el runner. Las acciones son las de LiteDD, fijadas por hash: `actions/checkout` 7.0.1, `actions/setup-java` 6.1.0 y `actions/setup-node` 7.1.0.
- **Servidor:** paquete `dev.cajonsastre.update`, del shell, con las piezas de LiteDD:
  - `UpdateUrls`: validación de la URL y rutas de las releases.
  - `UpdateManifest`: firma antes de interpretar el contenido.
  - `UpdateClient`: lista de hosts, redirecciones a mano y límites.
  - `Installation`: el JAR y su lanzador.
  - `UpdateHelper`: el proceso `sh`.
  - `Updater` y `UpdateApi`: búsqueda, instalación y rutas.
- **Ajuste:** `updateRepository` en `config.json` (D-05), que no entra en el repositorio.
- **Ventana:** al recuperar el contacto (U-07) compara el build de `/api/health` con el de la interfaz cargada y, si es otro, se recarga.

## Alternativas descartadas

- **Reutilizar la clave de LiteDD.** Ahorra un paso, pero une la confianza de las dos aplicaciones, y la constitución pide que no compartan configuración.
- **Seguir reinstalando con `scripts/install.sh`.** Es lo que dejó ADR-0009. Exige compilar en el equipo o copiar el JAR, que es justo la fricción que se quiere quitar.
- **Que las mini apps declaren si están ocupadas.** Hoy ninguna tiene trabajo en marcha, así que sería una abstracción sin uso real (principio 8).
- **Las demás alternativas de LiteDD:** `scripts/update.sh` con curl, hash sin firma, firmar en el equipo de desarrollo, buscar al arrancar, `api.github.com`, token de GitHub y repositorio inyectado por el build. Se descartan por los mismos motivos que en su ADR-0033.

## Consecuencias

- **La cuenta de GitHub pasa a ser el mayor riesgo.** Quien pueda hacer push a `master` puede publicar una versión firmada. Lo limitan que nada se instala sin pulsar «Actualizar» y que el diálogo muestra el commit y sus mensajes antes de confirmar.
- **La firma no cubre eso.** Protege frente a un JAR alterado después de publicarlo y frente a quien pueda subir ficheros a una release sin poder leer el secreto.
- **Solo se actualiza el JAR.** Los cambios en `install.sh`, en el lanzador, en las opciones de Java o en el runtime de la imagen siguen exigiendo reinstalar.
- **Volver atrás tras una migración no es inmediato.** Exige restaurar la copia previa de la base que migró (D-02, R-47).
- **El workflow no se debe renombrar.** GitHub cuenta las ejecuciones por workflow: con otro nombre, el número de build volvería a empezar y las instalaciones no verían las versiones nuevas (R-31).
- **La primera instalación es manual.** Hay que instalar una vez el JAR de la primera release, o uno compilado a mano, con `scripts/install.sh cajonsastre.jar`.
- **`./mvnw verify` se ejecutará en Linux por primera vez.** Las pruebas que solo corren allí (las de `InstallerTest`, los permisos 600 y `UpdateHelper`) pueden fallar donde en Windows se omiten.
- **Si se pierde la clave privada,** se genera otra y hay que instalar a mano una vez.
- **El JAR se puede descargar públicamente.** Solo contiene lo que ya está en el repositorio (S-30 a S-32).
