# Diseño de las mini apps

Este documento define cómo es una mini app y cómo se integra en CajonSastre. Los requisitos con identificador están en [requisitos/plataforma.md](../requisitos/plataforma.md); aquí se explica el porqué y el cómo.

## Conceptos

- **Shell**: la ventana, la barra superior, la barra lateral, el lanzador, «Ajustes», el ciclo de vida y el servidor. No sabe nada de lo que hace cada mini app.
- **Mini app**: una aplicación con un propósito (tareas, bases de datos…). Es una **porción vertical**: manifiesto, servidor opcional, base de datos opcional e interfaz, todo bajo un mismo identificador.
- **Plataforma**: el contrato público entre los dos. En Java es el paquete `dev.cajonsastre.platform`; en la interfaz, la carpeta `frontend/src/platform/`. Es lo único que una mini app puede importar del proyecto (P-18).

La regla de oro: **una mini app se puede añadir, quitar o romper sin tocar el shell ni a las demás**, salvo la línea que la declara en el catálogo.

## Anatomía

Una mini app con identificador `tasks` ocupa exactamente estos sitios:

```text
src/main/java/dev/cajonsastre/apps/tasks/     TasksApp.java (implementa MiniApp), sus mappers y su lógica
src/main/resources/db/apps/tasks/             V001__initial.sql, V002__….sql
src/test/java/dev/cajonsastre/apps/tasks/     sus pruebas
frontend/src/apps/tasks/                      index.tsx (su módulo), componentes, *.module.css, pruebas
specs/requisitos/tasks.md                     sus requisitos, con prefijo propio
```

Y en tiempo de ejecución:

```text
/api/apps/tasks/…                             sus rutas
#/apps/tasks/…                                su navegación
~/.local/share/cajonsastre/apps/tasks/        sus ficheros y su base data.db
~/.config/cajonsastre/apps/tasks/             su configuración y secretos
backups/tasks-AAAAMMDD-HHmmss-premigracion.db sus copias antes de migrar
app_state['tasks']                            su estado de interfaz, en la base del shell
```

Una mini app solo de interfaz (un conversor, un formateador) no tiene paquete Java propio: basta con su manifiesto y su carpeta de interfaz.

## Manifiesto y catálogo

El manifiesto es la identidad de la mini app y se declara en Java, en `AppCatalog`, porque el servidor es quien conoce además el estado en ejecución (`planned`, `available`, `failed`) y lo entrega a la interfaz con `GET /api/catalog`. Así hay una sola lista y una sola fuente de verdad (ADR-0005).

```java
new AppManifest("tasks", "Tareas", "Gestor de tareas", "tasks", AppColor.GREEN, AppCategory.PRODUCTIVITY,
        List.of("pendientes", "listas"), false)
```

- Icono, color y categoría son listas cerradas para que el lanzador sea coherente y el contraste esté garantizado (U-01). Un icono es un fichero `frontend/src/shell/icons/<nombre>.svg`; añadir uno es añadir el fichero.
- `planned = true` declara una mini app en preparación: aparece en el lanzador y se puede abrir, fijar y buscar, pero su página solo anuncia que llegará (L-05). Cuando se implementa, se cambia a `false` y se le dan sus módulos.
- El catálogo se valida al arrancar (P-03): un error en un manifiesto es un fallo de programación y debe verse en las pruebas, no en el uso.

## Servidor

### Contrato

```java
public interface MiniApp {
    AppManifest manifest();

    /** Recursos de migración de su base, en orden: db/apps/<id>/V001__….sql. Vacía: sin base de datos. */
    default List<String> migrations() { return List.of(); }

    /** Mappers de MyBatis de su base. */
    default List<Class<?>> mappers() { return List.of(); }

    /** Arranque: recibe su contexto y declara sus rutas. Si lanza, la mini app queda en failed (P-07). */
    default void start(AppContext context, AppRoutes routes) throws Exception { }

    /** Apagado: libera hilos, conexiones o ficheros abiertos. */
    default void stop() { }

    /** P-20: el motivo por el que no conviene apagar ni actualizar ahora; vacío si no hay ninguno. */
    default Optional<String> busy() { return Optional.empty(); }
}

public interface AppContext {
    String appId();
    Store store();        // su base; error si no declara migraciones
    Path dataDir();       // <datos>/apps/<id>/
    Path configDir();     // <config>/apps/<id>/
    Clock clock();
    Notifications notifications();   // P-21: notificaciones del shell
    Consoles consoles();             // P-25: consolas del shell
}
```

`AppRoutes` es un registro acotado: `routes.get("/items", handler)` publica `GET /api/apps/tasks/items`. Los manejadores son los de Javalin (`io.javalin.http.Handler`), y los errores se lanzan con `ApiError`, que el servidor convierte al formato de A-02. La mini app no recibe nunca el servidor completo, así que no puede registrar rutas fuera de su espacio ni filtros globales (S-16).

### Secuencia de arranque

```text
para cada mini app del catálogo, en su orden:
  planned            → estado planned, no se arranca nada
  si no:
    1. abrir su base (si tiene migraciones) y migrar, con copia previa (P-08, D-02)
    2. start(contexto, rutas)
    3. validar las rutas declaradas (P-06)
    éxito             → available; sus rutas se publican
    cualquier fallo   → failed con el mensaje; se cierra su base, se descartan sus rutas
                        y se registra el error con la traza (P-07)
```

El servidor HTTP arranca después, con las rutas de las mini apps disponibles y un filtro que responde 503 `app_unavailable` a cualquier ruta de una mini app en `failed`. Al apagar, se llama a `stop()` en orden inverso y se cierran las bases (P-10).

### Trabajos largos

Una mini app con un trabajo que no debe interrumpirse (una descarga, una importación) lo dice con `busy()` mientras dura (P-20, ADR-0012). El shell lo consulta en dos momentos: antes de apagarse porque no quedan ventanas, y antes de actualizar. En el primero aplaza el apagado; en el segundo rechaza la actualización con el motivo. Un apagado pedido de forma expresa (`--stop`) no espera: la mini app debe cancelar su trabajo en `stop()`.

### Notificaciones

Cuando ocurre algo que el usuario debe saber aunque no esté mirando (ha terminado un trabajo, ha fallado una tarea), la mini app lo dice con una línea (P-21, ADR-0013):

```java
// En start(): guardar context.notifications() y usarlo desde cualquier hilo.
Notifications notifications = context.notifications();

notifications.send("El trabajo ha terminado correctamente", NotificationKind.SUCCESS);
notifications.send("La exportación ha fallado", "Falta espacio en disco", NotificationKind.ERROR, "/exports/42");
```

El shell hace el resto, y la mini app no tiene que saber nada de ello:

- La guarda con el identificador de la mini app y la fecha, y conserva las 50 últimas (P-22).
- La muestra en la campana de la barra superior con el icono, el color y el nombre del manifiesto. Al pulsarla abre la mini app en la subruta indicada, o como estuviera si no se indica (N-11 a N-13).
- La envía a las ventanas abiertas, lanza la notificación de escritorio y reproduce el sonido, según lo que el usuario tenga en «Ajustes» (P-23, P-24).

Reglas de uso:

- Título de 1 a 80 caracteres y texto de hasta 300. Pasarse es un error de programación y lanza `IllegalArgumentException`.
- `send` no bloquea ni falla por culpa del shell: se puede llamar al final de un trabajo sin protegerlo.
- Una notificación es para lo que ocurre sin el usuario delante. La respuesta inmediata a una acción suya («Guardado») es un aviso de la interfaz: `notify` de `useMiniApp()` (U-05).
- Nada de secretos ni de datos que no deban verse en una notificación de escritorio.

En las pruebas de una mini app, las notificaciones emitidas se recogen pasando un `Notifications` propio a `AppRegistry.start` (véase `DatabaseAppTest`).

### Consolas

La salida de texto de una ejecución (los comandos de un trabajo y lo que devuelven) no se pinta en la mini app: se escribe en una consola del shell (P-25 a P-28, ADR-0014).

```java
// En start(): guardar context.consoles() y usarlo desde cualquier hilo.
Console console = consoles.open("Trabajo 3 · Hotfix");
console.line("$ aws s3api head-object …");
console.line(salidaDelComando);
console.finish(ConsoleState.SUCCEEDED);   // o FAILED, o CANCELLED
```

El shell hace el resto:

- La muestra en el panel inferior, con el nombre, la mini app y el estado: «En progreso» hasta que se llama a `finish` (N-14 a N-17).
- Conserva sus últimas 5000 líneas y las últimas 20 consolas, solo en memoria (P-26).
- El usuario las descarta con «Limpiar terminadas»; una consola en progreso no se puede descartar.

Reglas de uso:

- Nombre de 1 a 80 caracteres, que distinga esa ejecución de las demás.
- Toda consola abierta se termina, también si la ejecución falla o se cancela: si no, queda «En progreso» hasta que se apaga la aplicación.
- Es de solo lectura y solo vive en memoria: nada de secretos, y lo que deba conservarse se guarda en la base de la mini app.
- `console.id()` es su identificador. La interfaz de la mini app puede desplegar el panel en esa consola con `showConsole(id)` de `useMiniApp()`.

En las pruebas de una mini app, las consolas se recogen pasando un `Consoles` propio a `AppRegistry.start` (véase `DatabaseAppTest`).

### Datos

Cada mini app tiene **su propia base SQLite** (ADR-0006). Las razones:

- Aislamiento real: una migración rota o un fichero dañado afectan a una sola mini app.
- Versionado independiente: cada base tiene su `user_version`, sin tabla de control compartida.
- Copia, restauración o reinicio de una mini app sin tocar las demás: es un fichero.
- No hay transacciones entre mini apps, que no deben compartir datos (constitución, principio 3).

La base se abre con las mismas reglas que la del shell (D-01, D-02, D-03, D-07) a través de `Store`: `store.write(s -> …)` es una transacción serializada y `store.read(s -> …)` una lectura en paralelo.

## Interfaz

### Contrato

```tsx
// frontend/src/apps/tasks/index.tsx
import type { MiniAppModule } from '../../platform';
import { TasksApp } from './TasksApp';

const module: MiniAppModule = { Root: TasksApp };
export default module;
```

```tsx
// frontend/src/apps/tasks/TasksApp.tsx
import { useMiniApp, useAppState, useAppShortcut } from '../../platform';

export function TasksApp() {
  const { api, path, navigate, active, notify, setSubtitle } = useMiniApp();
  const [filter, setFilter] = useAppState('filter', 'pending');
  useAppShortcut('Alt+N', () => navigate('/new'));
  // …
}
```

`useMiniApp()` devuelve:

| Campo | Qué es |
|---|---|
| `id`, `manifest` | Su identidad |
| `active` | Si está visible. Una mini app oculta sigue montada (N-05): debe pausar sondeos y animaciones |
| `path` | Su subruta: `''` o `'/lista/42'` |
| `navigate(path, { replace })` | Cambia su subruta; entra en el historial del navegador (N-02) |
| `api` | Cliente acotado a `/api/apps/<id>` con `get`, `post`, `put`, `patch` y `delete` (P-13) |
| `notify(texto, tipo)` | Aviso no bloqueante del shell (U-05). No es una notificación: esas se emiten desde el servidor (P-21) |
| `setSubtitle(texto)` | Sección actual en la miga de pan (N-07) |
| `showConsole(id)` | Despliega el panel de consolas del shell con esa consola elegida (N-15). El identificador lo da el servidor de la mini app (P-25) |

### Ciclo de vida en la interfaz

```text
cerrada ──abrir──▶ cargando (import bajo demanda) ──▶ visible ◀──cambiar──▶ oculta (montada)
   ▲                         │ error                    │                       │
   │                         ▼                          │ cerrar (×, Alt+W)     │ sexta abierta (N-05)
   │                  error + «Reintentar» (P-15)       ▼                       ▼
   └──────────────────────────────────────────────── desmontada ◀───────────────┘
```

- Cada mini app se monta dentro de un **marco** del shell con su límite de errores, su `Suspense` y su contexto. Un error en su interfaz se queda en su marco (P-15).
- Una mini app puede desmontarse en cualquier momento (al cerrarla o al superar el máximo de abiertas). Lo que el usuario no deba perder se guarda en el servidor según se produce, no al desmontar (constitución, principio 7). Lo que solo es estado de interfaz va en `useAppState`.
- La interfaz de cada mini app es un fichero JavaScript aparte que solo se descarga al abrirla: el arranque de la ventana no crece con el número de mini apps.

### Estilos y atajos

- Estilos en CSS Modules (`TasksApp.module.css`): las clases quedan con un nombre único y una mini app no puede romper el aspecto del shell ni de otra (P-17). Se usan las variables del tema (`var(--surface)`, `var(--green)`…).
- Los atajos se registran con `useAppShortcut` (P-16): solo actúan con la mini app visible y no pueden pisar los del shell (N-10) ni los del navegador (U-04).

## Fronteras comprobadas

Las reglas de aislamiento no dependen de la buena voluntad: unas pruebas las comprueban en cada `./mvnw verify` (P-18, P-19).

| Regla | Prueba |
|---|---|
| Java: una mini app solo importa `dev.cajonsastre.platform` y su paquete | `AppBoundariesTest` recorre `src/main/java/dev/cajonsastre/apps/` |
| Interfaz: una mini app solo importa `src/platform/` y su carpeta | `boundaries.test.ts` recorre `frontend/src/apps/` |
| Interfaz: sin CSS global en una mini app | `boundaries.test.ts` |
| Toda mini app disponible tiene interfaz y todo icono existe | `AppCatalogTest` sobre el catálogo real |
| Rutas dentro de su espacio | `AppRoutesTest` |
| El fallo de una mini app no afecta a las demás | `AppRegistryTest` |

## Añadir una mini app

1. Especificación: `specs/requisitos/<id>.md` con un prefijo de requisitos propio, y su sprint.
2. Manifiesto en `AppCatalog` (o cambiar `planned` a `false` si ya estaba en preparación).
3. Si tiene servidor: paquete `dev.cajonsastre.apps.<id>` con la clase que implementa `MiniApp`, sus migraciones en `src/main/resources/db/apps/<id>/` y sus mappers.
4. Interfaz: `frontend/src/apps/<id>/index.tsx` con su módulo, sus componentes y sus `*.module.css`.
5. Pruebas que citan sus requisitos.
6. `./mvnw verify` en verde: incluye las pruebas de fronteras.

## Fuera de la plataforma, por ahora

Se añadirán cuando una mini app real los necesite (constitución, principio 8), cada uno con su ADR:

- Eventos del servidor hacia la interfaz de una mini app por el canal de presencia. Hoy solo lleva las notificaciones y la lista de consolas del shell (P-23, P-28).
- Escribir en una consola desde la interfaz, para una mini app sin servidor, y los estados «Abierto» y «Pausado» (ADR-0014).
- Emitir notificaciones desde la interfaz, para una mini app sin servidor (ADR-0013).
- Una categoría propia de cada mini app en «Ajustes».
- Comunicación entre mini apps (abrir un elemento de otra, compartir datos).
- Copias diarias, exportación e importación de los datos de las mini apps.
- Activar y desactivar mini apps desde «Ajustes».
- Abrir una mini app desde fuera con un enlace `cajonsastre://`.
