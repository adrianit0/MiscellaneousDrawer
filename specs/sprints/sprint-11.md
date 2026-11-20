# Sprint 11: Mini app «Reenviar PR»

## Objetivo

Volver a pedir en un solo paso los PR de corrección rechazados al cerrar una versión: rama nueva con la iteración siguiente, cherry-pick de sus commits sobre la `hotfix` nueva, push y PR en Bitbucket Data Center con el mismo título, la misma descripción, los mismos revisores y el enlace al anterior (ADR-0023).

## Requisitos cubiertos

- Reenviar PR: RP-01 a RP-45.
- Seguridad: S-15 (quinto destino autorizado).
- Plataforma: P-02 (icono nuevo `resubmit`).
- Constitución: principio 4.

Documentos: [requisitos/resubmit.md](../requisitos/resubmit.md), [ADR-0023](../decisiones/ADR-0023-mini-app-reenviar-pr.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos RP, ADR-0023, este sprint, el principio 4 de la constitución, S-15, la arquitectura y el reparto de sprints de «Gestask».
2. **Catálogo.** Manifiesto de `resubmit` en `AppCatalog` e icono `resubmit`. `AppCatalogTest` se adapta.
3. **Servidor**, paquete `dev.cajonsastre.apps.resubmit`, sin base de datos.
   - `ResubmitConfig` y `ConfigStore`: valores, formato y guardado con `PrivateFile` (RP-01 a RP-04, RP-07).
   - `Transport`, `HttpTransport` y `Bitbucket`: la API, detrás de una interfaz para las pruebas (RP-05, RP-06, RP-10, RP-28).
   - `Branches`: formato de rama, clave, iteración y rama nueva (RP-11, RP-14).
   - `Candidates`: los PR pendientes (RP-12, RP-13).
   - `Command`, `CommandRunner`, `ProcessRunner` y `JobRunner`: el trabajo (RP-20 a RP-35).
   - `ResubmitApp`: el `MiniApp` y sus rutas.
4. **Interfaz**, carpeta `frontend/src/apps/resubmit/`: «PR rechazados» y «Conexión» (RP-40 a RP-45).
5. **Pruebas.** De backend con `FakeBitbucket` y `FakeGit`, y con el git instalado contra un remoto en una carpeta temporal; de interfaz con la API simulada.
6. **Documentación.** `README.md` y `CLAUDE.md`.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Reenviar PR» aparece en el lanzador, en «Utilidades».
- Sin conexión guardada, la mini app abre en «Conexión» y no contacta con ningún servidor.
- El token no vuelve a la interfaz ni aparece en el registro ni en la consola.
- Con Bitbucket simulado: de cada clave solo aparece el PR rechazado más reciente, y no aparece si ya se reenvió.
- Con el git instalado y un remoto en una carpeta: un PR con dos commits se reenvía como `<prefijo><clave>-2` con esos dos commits sobre la rama destino nueva, la copia del usuario no cambia y no queda ninguna copia aparte; un PR con conflicto no sube nada y el trabajo sigue con el siguiente.
- Ninguna prueba contacta con un servidor.
- Con el Bitbucket real del usuario: sus PR rechazados se reenvían y los PR nuevos tienen el título, la descripción con «Procede de:», los revisores y los commits de los rechazados.

## Resultado

Fecha: 2026-11-20. Hecho en el código y probado con Bitbucket simulado y git real, en las pruebas y con la aplicación arrancada. Sin commits todavía. Falta la verificación con el Bitbucket real del usuario.

### Hecho

- **Especificación:** `requisitos/resubmit.md` (RP-01 a RP-45), ADR-0023 aceptada, este sprint, el principio 4 de la constitución, S-15, la arquitectura y el paso de «Rendimiento» de «Gestask» al sprint 12.
- **Catálogo:** `resubmit` disponible, con el icono nuevo `resubmit`, color `green` y categoría `utilities`.
- **Servidor (`dev.cajonsastre.apps.resubmit`):** `ResubmitConfig` y `ConfigStore`; `Transport`, `HttpTransport` y `Bitbucket` (el `HttpClient` del JDK, sin dependencias nuevas); `PullRequest`; `Branches` y `Candidates`; `Command`, `CommandRunner` y `ProcessRunner`, copiados de «Repositorios»; `JobRunner`; y `ResubmitApp` con sus rutas.
- **Interfaz (`frontend/src/apps/resubmit/`):** «PR rechazados» con la tabla, la selección, la confirmación y el resultado de cada PR con su enlace; «Conexión» con «Probar conexión».
- **Documentación:** `README.md` y `CLAUDE.md`.
- **Pruebas:** `./mvnw verify` en verde, con 482 de backend (19 omitidas en Windows, las mismas de antes) y 372 de interfaz.
  - Nuevas de backend: 7 en `BranchesTest`; 9 en `ResubmitAppTest`, con `FakeBitbucket` y sin git; 6 en `ResubmitGitTest`, con el git instalado y un remoto en una carpeta temporal: reenvío con dos commits y una mezcla, conflicto que no sube nada y deja seguir, rama existente que salta a `-3`, cambios ya en `hotfix`, PR no pendiente, commits que faltan, revisores rechazados, PR que no se crea tras subir la rama, remoto de otro repositorio y cancelación mientras se crea el PR. `AppCatalogTest` comprueba el manifiesto.
  - Nuevas de interfaz: 11 en `frontend/src/test/resubmitApp.test.tsx`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados, un remoto de prueba en una carpeta `PROJ/demo.git` y un Bitbucket simulado en `http://127.0.0.1:7990` (un servidor de prueba fuera del repositorio): sin conexión, la mini app abre en «Conexión» y dice qué falta; con un token equivocado, «Probar conexión» dice «El token no es válido o ha caducado», y con el bueno, «Conexión correcta con PROJ/demo»; «PR rechazados» muestra tres pendientes marcados con su rama nueva y uno atenuado por el formato de la rama; la confirmación dice «Se subirán 3 ramas al remoto y se crearán 3 PR en Bitbucket contra «hotfix»»; el trabajo termina con «2 recreados, 1 con conflictos», aviso y notificación; uno se creó sin revisores y lo dice; la consola muestra cada comando; la lista vuelve a pedirse y solo queda el del conflicto. En el remoto solo aparecen las dos ramas nuevas, `bug/TICKET-0001-2` tiene sus dos commits sobre la `hotfix` nueva, la copia del usuario sigue en `develop` y limpia, no queda ninguna copia aparte, y el token no aparece en el registro ni en la consola.

### Pendiente

- **Verificación con el Bitbucket real**: configurar la conexión y reenviar los PR rechazados de la última versión. En particular, comprobar que el filtro `role.1=AUTHOR&username.1=<usuario>` y `at=refs/heads/hotfix` devuelve los rechazados aunque la rama destino se borrara y se creara de nuevo, que los PR rechazados conservan `fromRef.latestCommit`, y que el certificado del servidor es de confianza para Java.
- No se recorrieron con la aplicación arrancada la cancelación ni el fallo al crear el PR: están cubiertos por las pruebas.
- Sprint 12: «Rendimiento», la configuración de parámetros y las horas revisadas de «Gestask».

### Desviaciones y decisiones

- **ADR-0023 (aceptada):** Bitbucket Data Center y subir ramas como destinos, se copian los revisores, un conflicto se aborta y se avisa, solo los PR del usuario y «Procede de:» al final de la descripción.
- **Los commits salen de git y no de la API de Bitbucket:** son los que llegan al último commit del PR sin estar en la rama destino nueva. Así se descartan los commits de otros que entraron por una mezcla y no se depende de que Bitbucket calcule los commits de un PR cuya rama destino se borró.
- **La lista no muestra el número de commits**, que se propuso en el plan: saberlo exige consultar el remoto, y la lista solo llama a la API. El número sale en el resultado de cada PR («2 commits»).
- **Pendiente es «el PR más reciente de su clave está rechazado desde hace 30 días o menos»** (RP-12): no se guarda qué se reenvió, lo dice la lista de Bitbucket.
- **La carpeta debe ser el repositorio configurado:** el trabajo comprueba que el `origin` termina en `<proyecto>/<repositorio>` antes de subir nada (RP-21).
- **Si Bitbucket rechaza a los revisores, el PR se crea sin ellos** y el resultado lo dice (RP-28), en lugar de fallar.
- **El resultado del trabajo se muestra en su propia tabla**, encima de la lista: tras terminar, la lista se vuelve a pedir y los PR reenviados desaparecen de ella.
