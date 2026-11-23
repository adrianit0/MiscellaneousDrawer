# CLAUDE.md

Instrucciones operativas para trabajar en CajonSastre. La fuente de verdad es `specs/`; este fichero solo resume.

## Comandos

| Acción | Comando |
|---|---|
| Build completo y todas las pruebas | `./mvnw verify` (en Windows también `mvnw.cmd verify`) |
| Solo backend | `./mvnw -Dskip.frontend verify` |
| Una prueba de backend | `./mvnw -Dskip.frontend test -Dtest=AppRegistryTest` |
| Pruebas de interfaz | `cd frontend && npm test` |
| Arrancar en desarrollo | `scripts/dev.sh` (Git Bash en Windows) → interfaz en http://127.0.0.1:5174/ |
| Arrancar con la interfaz empaquetada | `./mvnw verify` y después `./mvnw -Dskip.frontend exec:java -Dexec.mainClass=dev.cajonsastre.Main -Dexec.args=--no-window` → http://127.0.0.1:47800/ |
| Apagar la instancia en marcha | `./mvnw -Dskip.frontend exec:java -Dexec.mainClass=dev.cajonsastre.Main -Dexec.args=--stop` |
| Datos aislados para pruebas manuales | `XDG_DATA_HOME`, `XDG_CONFIG_HOME` y `XDG_STATE_HOME` apuntando a una carpeta temporal |
| JAR único | `./mvnw -Pdist package` → `target/dist/cajonsastre.jar` |
| Instalar en Ubuntu | `scripts/install.sh` (compila) o `scripts/install.sh cajonsastre.jar`; `scripts/uninstall.sh` (ADR-0009) |
| Publicar una versión | Push a `master`: `.github/workflows/release.yml` ejecuta `./mvnw -Pdist verify` y `scripts/release.sh` publica `build-N` (ADR-0010). No renombrar el workflow: reiniciaría el número de build |

Plataforma: se desarrolla en Windows 10 y se ejecuta en Ubuntu 22.04 (ADR-0004). El build y las pruebas deben pasar en los dos.

## Constitución (resumen de `specs/constitucion.md`)

1. La especificación manda: se corrige primero `specs/` y después el código.
2. Nada fuera de alcance: ni funciones, ni mini apps, ni dependencias, ni ajustes no pedidos.
3. Mini apps aisladas: datos, rutas y estado propios; solo usan la plataforma (P-18). El fallo de una no tumba nada más.
4. Los datos no salen de la máquina: los únicos destinos autorizados son GitHub, para el actualizador del shell (ADR-0010); S3, solo para que «Base de datos» descargue volcados (ADR-0011); los servidores git de los repositorios configurados, solo para que «Repositorios» traiga cambios, nunca `push` (ADR-0019); el proyecto de Supabase configurado en «Gestask», que recibe las tareas del usuario (ADR-0020); y el Bitbucket Data Center configurado en «Reenviar PR», con el servidor git de su repositorio, que reciben las ramas nuevas, los PR que la mini app vuelve a crear y la nota en la descripción de los rechazados: es el único `push`, solo de ramas nuevas y sin forzar (ADR-0023, ADR-0024); y el sitio de Jira Cloud configurado en «Tableros Jira», solo para leer proyectos, estados y tickets (ADR-0027); añadir otro exige autorización y ADR.
5. Convive con LiteDD: puerto 47800 (Vite 5174), carpetas `cajonsastre`, cabecera `X-CajonSastre-Token`, ventana y perfil de Chrome propios (C-08).
6. Repositorio público: reglas S-30 a S-35.
7. Los datos del usuario no se pierden: transacciones, copia antes de migrar y guardado continuo.
8. Simplicidad: sin Spring y sin abstracciones sin dos usos reales (el contrato de mini apps es la excepción explícita).
9. Cada requisito tiene al menos una prueba que cita su identificador.
10. Ante una ambigüedad, se pregunta y se registra la respuesta como ADR.

## Convenciones

- Código, identificadores, tablas y rutas de API en **inglés**. Paquete raíz `dev.cajonsastre`.
- Textos de interfaz, especificaciones y mensajes de commit en **español**, neutros.
- Las pruebas citan el identificador del requisito en su nombre (`p07_a_failed_app_answers_503…`, `it('N-05 …')`, `describe('P-15 …')`).
- Decisiones nuevas: `specs/decisiones/ADR-NNNN-titulo.md`.
- Prefijos del shell: S, A, P, N, L, U, C, D, R. Cada mini app usa un prefijo propio de dos o más letras: BD es el de «Base de datos», CD el de «Calidad del dato», CP el de «Cerrar procesos», RG el de «Repositorios», GT el de «Gestask», RP el de «Reenviar PR», LB el de «Lootboxes», IN el de «Inventario» y JR el de «Tableros Jira».
- Datos reales fuera del repositorio (S-30 a S-32): la configuración de «Base de datos» y de «Calidad del dato» (bucket, rutas, contraseña), la lista de «Repositorios» (nombres, carpetas, URL), la conexión de «Gestask» (URL de Supabase, clave, email, contraseña) la de «Reenviar PR» (URL de Bitbucket, token, proyecto, repositorio, usuario, carpeta) y la de «Tableros Jira» (sitio, email, token) se escriben en la aplicación; las pruebas usan valores inventados.

## Estructura

- `specs/`: constitución, requisitos, diseño (`diseno/mini-apps.md` es el contrato de las mini apps), sprints y ADR.
- `src/main/java/dev/cajonsastre/`: backend (Javalin).
  - `platform/`: contrato público para las mini apps (`MiniApp`, `AppManifest`, `AppContext`, `AppRoutes`, `Store`, `ApiError`, `Notifications`, `Consoles`, `Messages`).
  - `catalog/`: `AppCatalog` (donde se declaran las mini apps), `AppRegistry` (arranque aislado y rutas), `/api/catalog`, `/api/app-state`.
  - `http/`, `lifecycle/`, `settings/`: servidor, ciclo de vida y ajustes del shell.
  - `notifications/`: notificaciones de las mini apps (P-21 a P-24, ADR-0013): se guardan en la base del shell, llegan a la campana por `/api/events` y lanzan `notify-send` y `paplay`. Una mini app las emite con `context.notifications().send(…)`.
  - `consoles/`: consolas de las mini apps (P-25 a P-28, ADR-0014): la salida de sus ejecuciones, solo en memoria; la lista llega al panel inferior por `/api/events` y las líneas se piden a `/api/consoles/{id}`. Una mini app escribe con `context.consoles().open(…)`, `line(…)` y `finish(…)`.
  - `messages/`: mensajes entre mini apps (P-29 a P-32, ADR-0025), lo único que pasa de una a otra: se guardan en la base del shell hasta que la destinataria los confirma, sin rutas de API ni eventos. Una mini app envía con `context.messages().send(…)` y lee con `pending()` y `ack(…)`; la entrega es al menos una vez.
  - `update/`: actualización desde GitHub, la única salida de la máquina (R-01 a R-47, ADR-0010). Ninguna mini app la usa.
  - `apps/<id>/`: el servidor de cada mini app. `apps/database/` ejecuta `aws` y `docker` detrás de `CommandRunner`; sus pruebas usan `FakeCommands`, sin tenerlos instalados. `apps/quality/` ejecuta los scripts de calidad con `docker exec … mysql --xml` y tiene su propio `CommandRunner`, porque no puede importar el de otra mini app (P-18, ADR-0016). `apps/processes/` busca y cierra procesos detrás de `ProcessTable`; sus pruebas usan `FakeProcesses` y no cierran nada del equipo (ADR-0018). `apps/repos/` ejecuta `git` detrás de su propio `CommandRunner`; sus pruebas usan `FakeGit` y, con el git instalado (`RealGitTest`), un remoto que es otra carpeta temporal: ninguna contacta con un servidor (ADR-0019). `apps/gestask/` es un intermediario hacia el Supabase de Gestask detrás de `Transport`: guarda la conexión, mantiene la sesión en memoria, la reinicia ante un 401 y reenvía una lista cerrada de Edge Functions (`Functions`) sin interpretarlas; sus pruebas usan `FakeSupabase`. No se cambia nada en Supabase: el backend es el de la versión web de Gestask (ADR-0020). `apps/resubmit/` habla con la API REST de Bitbucket Data Center detrás de su `Transport` y ejecuta `git` detrás de su propio `CommandRunner`: aplica los commits en un `git worktree` aparte y sube solo la rama nueva (`JobRunner`); sus pruebas usan `FakeBitbucket` y, con el git instalado (`ResubmitGitTest`), un remoto en una carpeta temporal con la ruta `PROJ/demo.git` (ADR-0023). `apps/gestask/` pasa además a «Lootboxes» los PE cerrados que lee de `calendar-month-get` (`EffortPoints`, GT-120). `apps/lootboxes/` y `apps/inventory/` son las mini apps de ocio (ADR-0026), las primeras con base propia: «Lootboxes» crea un cofre por PE (hasta 8 al día), los desbloquea a las 8:00 del día siguiente, sortea los objetos con `LootTable` y los envía a «Inventario» por el buzón; conseguir un cofre no se anuncia en ningún sitio. Sus pruebas usan un reloj que se mueve y un azar fijo. `apps/jira/` lee de Jira Cloud detrás de su `Transport` (solo `GET` y `POST /rest/api/3/search/jql`): guarda los tableros en su base, arma el JQL de cada uno por proyecto (`IssueQuery`) y reparte los tickets por el par proyecto-estado; sus pruebas usan `FakeJira`, que evalúa ese JQL (ADR-0027).
- `src/main/resources/db/shell/` y `db/apps/<id>/`: migraciones SQLite del shell y de cada mini app.
- `frontend/src/`: `shell/` (disposición, navegación, lanzador, campana de notificaciones, panel de consolas), `platform/` (API pública para las mini apps), `apps/<id>/` (interfaz de cada mini app).
- `scripts/`: arranque en desarrollo, instalación y desinstalación en Ubuntu, y publicación (`release.sh`). `packaging/`: plantilla del lanzador `.desktop`. `.github/workflows/`: publicación de versiones.

## Añadir una mini app

Seguir `specs/diseno/mini-apps.md`, «Añadir una mini app»: especificación propia, manifiesto en `AppCatalog`, paquete
`dev.cajonsastre.apps.<id>` si tiene servidor, `frontend/src/apps/<id>/index.tsx` y pruebas. Las pruebas de fronteras
(`AppBoundariesTest`, `boundaries.test.ts`) y `AppCatalogTest` fallan si se rompe el contrato.

## Flujo de un sprint

1. Leer CLAUDE.md, `specs/constitucion.md` y `specs/sprints/sprint-0N.md`, con los requisitos y diseños que cita y el «Resultado» del sprint anterior.
2. Revisar el plan de tareas, presentarlo y esperar aprobación.
3. Escribir las pruebas de cada requisito y después el código.
4. Verificar: `./mvnw verify` en verde y criterios de aceptación recorridos con la aplicación arrancada.
5. Registrar cada decisión nueva como ADR y actualizar la especificación si cambió.
6. Rellenar «Resultado» en el fichero del sprint y hacer commits pequeños en español.
