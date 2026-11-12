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
4. Los datos no salen de la máquina: los únicos destinos autorizados son GitHub, para el actualizador del shell (ADR-0010), y S3, solo para que «Base de datos» descargue volcados (ADR-0011); añadir otro exige autorización y ADR.
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
- Prefijos del shell: S, A, P, N, L, U, C, D, R. Cada mini app usa un prefijo propio de dos o más letras: BD es el de «Base de datos».
- Datos reales fuera del repositorio (S-30 a S-32): la configuración de «Base de datos» (bucket, rutas, contraseña) se escribe en la aplicación; las pruebas usan valores inventados.

## Estructura

- `specs/`: constitución, requisitos, diseño (`diseno/mini-apps.md` es el contrato de las mini apps), sprints y ADR.
- `src/main/java/dev/cajonsastre/`: backend (Javalin).
  - `platform/`: contrato público para las mini apps (`MiniApp`, `AppManifest`, `AppContext`, `AppRoutes`, `Store`, `ApiError`, `Notifications`, `Consoles`).
  - `catalog/`: `AppCatalog` (donde se declaran las mini apps), `AppRegistry` (arranque aislado y rutas), `/api/catalog`, `/api/app-state`.
  - `http/`, `lifecycle/`, `settings/`: servidor, ciclo de vida y ajustes del shell.
  - `notifications/`: notificaciones de las mini apps (P-21 a P-24, ADR-0013): se guardan en la base del shell, llegan a la campana por `/api/events` y lanzan `notify-send` y `paplay`. Una mini app las emite con `context.notifications().send(…)`.
  - `consoles/`: consolas de las mini apps (P-25 a P-28, ADR-0014): la salida de sus ejecuciones, solo en memoria; la lista llega al panel inferior por `/api/events` y las líneas se piden a `/api/consoles/{id}`. Una mini app escribe con `context.consoles().open(…)`, `line(…)` y `finish(…)`.
  - `update/`: actualización desde GitHub, la única salida de la máquina (R-01 a R-47, ADR-0010). Ninguna mini app la usa.
  - `apps/<id>/`: el servidor de cada mini app. `apps/database/` ejecuta `aws` y `docker` detrás de `CommandRunner`; sus pruebas usan `FakeCommands`, sin tenerlos instalados.
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
