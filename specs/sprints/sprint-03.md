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

Pendiente.
