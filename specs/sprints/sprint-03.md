# Sprint 3: Mini app «Base de datos»

## Objetivo

Que la base de datos local se prepare desde Cajón de sastre: descargar un volcado de S3, importarlo en el contenedor MySQL de Docker y ejecutar los scripts SQL pendientes, viendo el progreso y el registro. Con una biblioteca de copias que guarda siempre el volcado anterior y deja conservar otros. Es la primera mini app con funcionalidad.

## Requisitos cubiertos

- Base de datos: BD-01 a BD-65.
- Cambios en la constitución (principio 4), S-15, la arquitectura y ADR-0008.
- Plataforma: P-20, con cambios en C-05, R-41 y la API (ADR-0012).

Documentos: [requisitos/database.md](../requisitos/database.md), [ADR-0011](../decisiones/ADR-0011-mini-app-base-de-datos.md), [ADR-0012](../decisiones/ADR-0012-mini-apps-ocupadas.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Además de los requisitos BD y los dos ADR:
   - Constitución, principio 4: S3 entra en la lista de destinos, solo para `database` y solo para descargar.
   - S-15: «Ninguna mini app tiene destinos autorizados» pasa a nombrar la excepción.
   - Arquitectura: Sprint 3, prefijo BD y `apps.database` en los componentes.
   - ADR-0008: nota de que `database` ya no está en preparación.
2. **Catálogo.** `database` deja de ser `planned`, con su descripción y sus palabras clave nuevas. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.database`. Sin base de datos ni migraciones.
   - `DatabaseConfig`: valores, validación de formato, campos que faltan por paso y guardado con `PrivateFile` (BD-01 a BD-04).
   - `CommandRunner`: ejecución de comandos con entorno, entrada desde fichero, salida línea a línea y cancelación (BD-15, BD-16, BD-19).
   - `DumpLibrary`: volcado actual, copia anterior y conservadas; rotar, conservar y eliminar (BD-30 a BD-37).
   - `S3Download`: consulta del objeto, descarga por bloques reanudable, descarga directa y ficheros de `dynamodb/` (BD-20 a BD-29).
   - `DockerImport`: la secuencia de importación (BD-40, BD-41).
   - `SqlScripts`: carpetas, ficheros y ejecución (BD-50 a BD-54).
   - `JobRunner`: un trabajo a la vez, pasos, progreso, registro acotado, cancelación y aviso al terminar (BD-10 a BD-18).
   - `DatabaseApp`: el `MiniApp` y sus rutas.
4. **Interfaz**, carpeta `frontend/src/apps/database/`.
   - Secciones y navegación (BD-60).
   - «Preparar»: formulario, confirmación, progreso y registro (BD-42, BD-61 a BD-63).
   - «Copias» (BD-64).
   - «Configuración» (BD-65).
5. **Plataforma** (ADR-0012): `MiniApp.busy()`, `AppRegistry`, `Presence` y `POST /api/update/apply` (P-20).
6. **Documentación.** `README.md`: qué hace la mini app, qué necesita instalado y que se conecta a S3 al descargar. `CLAUDE.md`: prefijo BD y el principio 4.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

Orden: primero las pruebas de cada requisito y después su código. Commits pequeños en español; ningún push, porque publicaría una versión (R-01).

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Base de datos» se abre desde el lanzador sin la insignia «En preparación» y muestra sus tres secciones.
- Sin configuración, los tres pasos están desactivados y dicen qué falta. Tras guardarla, el fichero tiene permisos 600 en Linux y la contraseña no vuelve a salir del servidor.
- Un valor con formato incorrecto impide guardar e indica su campo.
- Con comandos simulados, un trabajo completo descarga por bloques, rota, importa y ejecuta los scripts en el orden de BD-41 y BD-51, y la contraseña no aparece en ningún comando ni en el registro.
- Una descarga interrumpida se reanuda donde quedó. Si el objeto remoto cambió, empieza de cero.
- Tras dos descargas de volcados distintos hay un actual y una anterior. Tras la tercera, la anterior es la segunda y la primera ya no está, salvo que se conservara.
- Volver a descargar un volcado que no ha cambiado no rota nada.
- Un paso que falla deja los siguientes como omitidos. Un script SQL que falla no detiene los demás.
- Pedir un segundo trabajo responde 409. «Cancelar» detiene el comando en curso.
- Un nombre de fichero o de versión con `..` o con una barra se rechaza sin tocar el disco.
- En Ubuntu, con `aws` y `docker` reales: un trabajo completo deja la base importada y los scripts ejecutados, y al terminar suena el aviso.

## Resultado

Fecha: 2026-11-11. Hecho en el código y probado con comandos simulados; falta la verificación con `aws` y `docker` reales en Ubuntu.

### Hecho

- **Especificación:** requisitos BD-01 a BD-65 en `requisitos/database.md`, ADR-0011 y ADR-0012 aceptados, P-20 nuevo, y cambios en la constitución (principio 4), S-15, C-05, R-41, la API, la arquitectura, `diseno/mini-apps.md` y ADR-0008.
- **Plataforma (P-20):** `MiniApp.busy()`, `AppRegistry.busy()`, `Presence` aplaza el apagado por falta de ventanas y `POST /api/update/apply` responde 409 `app_busy` antes de descargar nada.
- **Servidor (`dev.cajonsastre.apps.database`), sin base de datos:**
  - `DatabaseConfig` y `ConfigStore`: configuración validada, guardada con permisos 600 y sin devolver nunca la contraseña.
  - `CommandRunner` y `ProcessRunner`: comandos externos con entorno, entrada desde fichero, salida línea a línea y cancelación del proceso y sus hijos.
  - `DumpLibrary`: volcado actual, copia anterior y conservadas; rotación por renombrado y conservación con enlace duro.
  - `S3Download`: consulta del objeto, descarga por bloques reanudable con ETag, descarga directa y ficheros de `dynamodb/`.
  - `DockerImport` y `SqlScripts`: la secuencia de importación y la ejecución de scripts, con la contraseña por variables de entorno.
  - `JobRunner` y `DatabaseApp`: un trabajo a la vez, pasos, progreso, registro acotado, cancelación, aviso al terminar y las rutas.
- **Interfaz (`frontend/src/apps/database/`):** secciones «Preparar», «Copias» y «Configuración», confirmación antes de importar, seguimiento del trabajo por sondeo y diálogos para conservar y eliminar copias.
- **Catálogo:** `database` deja de estar en preparación, con su descripción y sus palabras clave nuevas.
- **Documentación:** `README.md` (sección «Base de datos», qué necesita instalado y cuándo se conecta a S3) y `CLAUDE.md`.
- **Pruebas:** 337 de backend y 186 de interfaz.
  - Nuevas de backend: 156 en `apps/database` (`DatabaseConfigTest`, `ProcessRunnerTest`, `DumpLibraryTest`, `S3DownloadTest`, `DockerImportTest`, `SqlScriptsTest` y `DatabaseAppTest`) y 4 de P-20 en `AppRegistryTest`, `LifecycleTest` y `UpdaterTest`.
  - Nuevas de interfaz: 28 en `test/databaseApp.test.tsx` y 1 de R-41 en `UpdateSettings.test.tsx`.
  - En Windows se omiten 19 de backend, las mismas de los sprints anteriores que necesitan `sh` o permisos POSIX.

### Criterios de aceptación

1. **`./mvnw verify` en verde:** en Windows 10, con las pruebas de fronteras. **Cumplido.**
2. **Se abre sin «En preparación» y con sus tres secciones:** con el JAR arrancado y datos aislados. **Cumplido.**
3. **Sin configuración, los pasos están desactivados y dicen qué falta; tras guardarla, la contraseña no vuelve a salir:** recorrido con la aplicación arrancada: el fichero la contiene y `GET /config` no. Los permisos 600 solo se comprueban en Linux. **Cumplido en Windows; los permisos, en pruebas.**
4. **Un valor con formato incorrecto impide guardar e indica su campo:** un puerto «abc» muestra el error junto al campo. **Cumplido.**
5. **Trabajo completo con comandos simulados, en el orden de BD-41 y BD-51 y sin la contraseña en ningún comando ni registro:** `DatabaseAppTest`, `DockerImportTest` y `SqlScriptsTest`. **Cumplido en pruebas.**
6. **Reanudación, y vuelta a empezar si el objeto cambió:** `S3DownloadTest` (BD-23, BD-24). **Cumplido en pruebas.**
7. **Rotación tras dos y tres descargas, y sin rotar si el volcado no cambió:** `DatabaseAppTest` y `DumpLibraryTest` (BD-22, BD-31). **Cumplido en pruebas.**
8. **Un paso que falla omite los siguientes; un script que falla no detiene los demás:** pruebas BD-12 y BD-52. Con la aplicación arrancada y sin `aws`, el trabajo terminó como fallido con «No se encontró el comando «aws»» y los otros dos pasos omitidos. **Cumplido.**
9. **Segundo trabajo 409 y «Cancelar»:** pruebas BD-10 y BD-15; `ProcessRunnerTest` cancela un proceso real. **Cumplido en pruebas.**
10. **Nombres con `..` o barras:** pruebas BD-37 y BD-53, también por la API. **Cumplido en pruebas.**
11. **Conservar una copia:** con la aplicación arrancada, «Conservar» creó `backups/hotfix/kept-…-base de prueba.tar.gz` como enlace duro en NTFS. **Cumplido.**
12. **Trabajo completo en Ubuntu con `aws` y `docker` reales:** **pendiente.** En el equipo de desarrollo no están instalados.

El registro del shell solo recogió «Trabajo 1 … iniciado» y «terminado: failed», sin rutas, bucket ni contraseña (S-21).

### Pendiente

- **Verificación en Ubuntu:** un trabajo completo contra S3 y Docker, la reanudación de una descarga real, el aviso de escritorio con sonido y los permisos 600 del fichero de configuración.
- **Entorno del lanzador:** comprobar que `aws` encuentra sus credenciales cuando la aplicación se abre desde el escritorio. Si dependen de variables de la terminal, hará falta un campo de perfil (ADR-0011).
- **Sprints anteriores:** siguen pendientes la primera publicación (`build-1`) y la actualización real en Ubuntu.

### Desviaciones y decisiones

- **ADR-0011 (aceptada):** la mini app va en `database`, las copias son una biblioteca de ficheros, S3 se autoriza con la CLI `aws` y la configuración vive dentro de la mini app.
- **ADR-0012 (aceptada):** las mini apps pueden declararse ocupadas (P-20).
- **BD-27 ampliado:** en el modo «Directa» la CLI descarga a un fichero temporal propio, así que no se puede medir el progreso por tamaño. Se muestra el texto de progreso de la propia CLI como mensaje del paso.
- **Formatos más estrictos en BD-01:** la imagen de MySQL y el nombre de la base no pueden empezar por `-`, para que nunca se confundan con una opción de `docker` o de `mysql`.
- **El servidor se confirmó antes de declararse en el catálogo**, para que cada commit dejara el build en verde: una mini app disponible sin interfaz no pasa P-19.
- **Las pruebas de interfaz de la mini app están en `frontend/src/test/`** y no en su carpeta, porque `boundaries.test.ts` recorre `src/apps/` y una prueba necesita el servidor simulado del shell.
- **Una prueba de backend falló una vez en seis ejecuciones completas** y no se ha podido reproducir ni identificar. Las de este sprint con hilos o procesos reales (`ProcessRunnerTest`, `LifecycleTest`) son las candidatas; queda anotado para vigilarlo.

### Cómo probarlo a mano (en Ubuntu)

1. Instalar la versión nueva y abrir «Base de datos» desde el lanzador.
2. En «Configuración», rellenar los valores del antiguo `config.sh` y pulsar «Guardar».
3. En «Preparar», elegir la rama, dejar los tres pasos marcados y pulsar «Iniciar». Confirmar la importación.
4. Seguir el progreso y el registro. Al terminar debe sonar el aviso.
5. Cerrar la ventana durante un trabajo y volver a abrirla: el trabajo sigue.
6. En «Copias», conservar el volcado actual con un nombre. Tras la siguiente descarga, comprobar que el anterior aparece como «Anterior».
