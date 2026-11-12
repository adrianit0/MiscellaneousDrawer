# Requisitos de la plataforma de mini apps

Una **mini app** es una aplicación pequeña que vive dentro de CajonSastre: un gestor de tareas, un gestor de bases de datos, etc. El **shell** es todo lo demás: ventana, lanzador, navegación, ajustes y ciclo de vida. La **plataforma** es el contrato entre los dos. El diseño completo y el procedimiento para añadir una mini app están en [diseno/mini-apps.md](../diseno/mini-apps.md).

## Identidad y catálogo

| ID | Requisito |
|---|---|
| P-01 | Cada mini app tiene un identificador de 2 a 32 caracteres que cumple `[a-z][a-z0-9-]*[a-z0-9]`, en inglés. Es único e inmutable: da nombre a su carpeta de datos, a su espacio de API, a su ruta de navegación, a su paquete Java y a su carpeta de interfaz. `shell`, `cajonsastre`, `platform` y `home` están reservados. |
| P-02 | Cada mini app declara un manifiesto: identificador, nombre visible (1 a 40 caracteres), descripción de una línea (1 a 140), icono, color, categoría, hasta 10 palabras clave y si está en preparación. Icono, color y categoría se eligen de listas cerradas: los iconos de `frontend/src/shell/icons/`, los colores `blue`, `green`, `violet`, `orange`, `cyan` y `gold` (U-01), y las categorías `data` («Datos»), `productivity` («Productividad») y `utilities` («Utilidades»). |
| P-03 | El catálogo (`AppCatalog`) es el único sitio donde se declaran las mini apps. Al arrancar se valida entero: un manifiesto que no cumple P-01 o P-02, o un identificador repetido, impide arrancar la aplicación, porque es un error de programación y no de datos. |
| P-04 | Cada mini app está en uno de tres estados: `planned` (en preparación: solo tiene manifiesto), `available` (arrancada) o `failed` (falló al arrancar, con su mensaje). `GET /api/catalog` devuelve los manifiestos con su estado. |

## Backend

| ID | Requisito |
|---|---|
| P-05 | La parte de servidor de una mini app es opcional. Si la tiene, declara sus migraciones y sus mappers de MyBatis, y recibe al arrancar su contexto (P-08, P-09, P-21, P-25) y su registro de rutas (P-06). Al apagar se le avisa para que libere sus recursos. |
| P-06 | Las rutas de una mini app cuelgan de `/api/apps/<id>`. Se declaran relativas, empiezan por `/` y no contienen `..`, `\`, `?` ni `#`. Una ruta que no lo cumple hace fallar el arranque de esa mini app (P-07). |
| P-07 | Si el arranque de una mini app falla, incluida una migración, queda en `failed`, el error va al registro y sus rutas responden 503 `app_unavailable`. El shell y las demás mini apps siguen funcionando. |
| P-08 | Una mini app con migraciones tiene su propia base SQLite en `<datos>/apps/<id>/data.db`, con migraciones propias en `db/apps/<id>/` y su propio `user_version` (D-02). Antes de migrar una base existente se copia a `backups/<id>-AAAAMMDD-HHmmss-premigracion.db`; se conservan las 2 últimas de cada mini app. Ninguna mini app abre la base de otra ni la del shell. |
| P-09 | El contexto da a cada mini app su carpeta de ficheros `<datos>/apps/<id>/` y su carpeta de configuración `<config>/apps/<id>/`. Los secretos se escriben con `PrivateFile` (S-20). |
| P-10 | Al apagar se avisa a las mini apps en orden inverso al de arranque y se cierran sus bases. Un fallo al avisar a una no impide avisar a las demás ni cerrar las bases. |
| P-20 | Una mini app puede declararse ocupada mientras hace un trabajo que no debe interrumpirse: `MiniApp.busy()` devuelve el motivo, o vacío. Mientras alguna lo esté, el apagado por falta de ventanas (C-05) se aplaza y se vuelve a comprobar pasado el mismo plazo, y «Actualizar» no continúa y dice el motivo (R-41). `cajonsastre --stop`, `POST /api/shutdown` y el instalador apagan igualmente, y la mini app cancela su trabajo al recibir el aviso de apagado (P-10). Si preguntar a una mini app falla, cuenta como no ocupada y el error va al registro (ADR-0012). |

## Notificaciones

Una **notificación** deja constancia de algo que ha ocurrido en una mini app, como el fin de un trabajo, y se conserva hasta que el usuario la limpia (ADR-0013). No es un aviso de U-05, que es un mensaje breve de la interfaz.

| ID | Requisito |
|---|---|
| P-21 | El servidor de una mini app emite una notificación con `context.notifications().send(título, texto, tipo, subruta)`: un título de 1 a 80 caracteres, un texto opcional de hasta 300, un tipo (`info`, `success` o `error`) y, opcional, la subruta de la mini app a la que lleva, con el formato de P-06. El shell añade la mini app y la fecha. Un valor fuera de formato lanza un error a la mini app, porque es un error de programación. Un fallo del shell al guardar o anunciar la notificación no llega a la mini app: va al registro, sin el título ni el texto (S-21). |
| P-22 | Las notificaciones se guardan en la base del shell (D-04) y se conservan las 50 últimas. `GET /api/notifications` las devuelve de la más reciente a la más antigua, sin las de mini apps que ya no están en el catálogo. `DELETE /api/notifications` las borra todas. |
| P-23 | Cada notificación nueva se envía a las ventanas abiertas por el canal `/api/events` (C-04), como un evento `notification` con el mismo objeto que devuelve `GET /api/notifications`. |
| P-24 | Al emitirse una notificación, el servidor lanza `notify-send <nombre de la mini app> <título>` si el ajuste «Notificación de escritorio» está activo, y `paplay` con el sonido de finalización del sistema si lo está «Sonido» (U-06). Los comandos se lanzan sin esperar a que terminen y sin las variables `_JPACKAGE_LAUNCHER` y `LD_LIBRARY_PATH`. Si no existen o fallan, no pasa nada. |

## Consolas

Una **consola** es la salida de texto de una ejecución de una mini app, como un trabajo, con un nombre y un estado (ADR-0014). Es de solo lectura: no admite entrada. Todas se ven en el panel inferior del shell (N-14 a N-17).

| ID | Requisito |
|---|---|
| P-25 | El servidor de una mini app abre una consola con `context.consoles().open(nombre)`, con un nombre de 1 a 80 caracteres. El shell le da un identificador y le añade la mini app, la fecha y el estado `running` («En progreso»). `line(texto)` le añade líneas: un texto con saltos de línea son varias, y una línea de más de 2000 caracteres se corta. `finish(estado)` la termina como `succeeded` («Terminado»), `failed` («Error») o `cancelled` («Cancelado») y le pone la fecha de fin; después, `line` y `finish` no hacen nada. Un nombre fuera de formato o un estado nulo lanzan un error a la mini app, porque es un error de programación. Se puede llamar desde cualquier hilo. |
| P-26 | Las consolas solo viven en memoria: se pierden al apagar la aplicación, y sus líneas no van a disco ni al registro del shell (S-21). De cada consola se conservan las últimas 5000 líneas; cada línea tiene un índice que no cambia aunque se descarten las más antiguas. Se conservan 20 consolas: al abrir otra se descarta la terminada más antigua. Una consola en progreso nunca se descarta. |
| P-27 | `GET /api/consoles` devuelve las consolas de la más reciente a la más antigua, sin las de mini apps que ya no están en el catálogo y sin sus líneas. `GET /api/consoles/{id}?after=N` devuelve la consola y sus líneas con índice mayor o igual que N; 404 `console_not_found` si no existe y 400 `invalid_request` si N no es un número. `DELETE /api/consoles` descarta las que no están en progreso y devuelve las que quedan. |
| P-28 | Cada cambio en la lista de consolas (una se abre, una termina o se limpian) se envía a las ventanas abiertas por el canal `/api/events` (C-04), como un evento `consoles` con el mismo objeto que devuelve `GET /api/consoles`. Las líneas no viajan por el canal. Un fallo al repartirlo no llega a la mini app: va al registro. |

## Interfaz

| ID | Requisito |
|---|---|
| P-11 | La interfaz de una mini app disponible está en `frontend/src/apps/<id>/index.tsx`, que exporta por defecto un módulo con su componente raíz. Se carga bajo demanda, en un fichero propio, la primera vez que se abre. Una mini app disponible sin interfaz muestra «Esta mini app no tiene interfaz». |
| P-12 | La mini app recibe su contexto con `useMiniApp()`: identificador, manifiesto, si está visible, su subruta, `navigate` para moverse dentro de ella, su cliente de API, `notify` para los avisos del shell, `setSubtitle` para la miga de pan (N-07) y `showConsole(id)`, que despliega el panel de consolas con esa consola elegida (N-14, N-15). |
| P-13 | El cliente de API de una mini app solo llama a su espacio `/api/apps/<id>/…`, con el token (S-12). Una ruta que no empieza por `/` o que contiene `..` se rechaza sin llegar al servidor. |
| P-14 | `useAppState(clave, inicial)` guarda estado de interfaz de la mini app (filtros, anchos, la última vista) en la base del shell, en un documento JSON por mini app de hasta 64 KB. Se guarda 400 ms después del último cambio y al cerrar la ventana, y se recupera al abrirla. |
| P-15 | Si la interfaz de una mini app lanza un error al pintarse o al cargarse, su área muestra el error y «Reintentar», que la vuelve a montar. El shell y las demás mini apps siguen funcionando. |
| P-16 | `useAppShortcut(atajo, acción)` registra un atajo que solo actúa mientras la mini app está visible. Un atajo reservado por el shell (N-10) o por el navegador (U-04) lanza un error al registrarse. |
| P-17 | Los estilos de una mini app van en CSS Modules (`*.module.css`) dentro de su carpeta y usan las variables del tema (U-01). Una mini app no define estilos globales. |

## Fronteras

| ID | Requisito |
|---|---|
| P-18 | El código de una mini app solo importa la plataforma y su propio código. En Java: `dev.cajonsastre.platform` y `dev.cajonsastre.apps.<id>`, además de las bibliotecas. En la interfaz: `src/platform/` y su carpeta `src/apps/<id>/`, además de las bibliotecas. Unas pruebas recorren el código y fallan ante cualquier otra importación. |
| P-19 | Toda mini app no `planned` del catálogo tiene interfaz (P-11) y todo icono usado existe (P-02). Una prueba lo comprueba sobre el catálogo real. |
