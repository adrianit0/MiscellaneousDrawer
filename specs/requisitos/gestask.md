# Mini app «Gestask»

Adapta a Cajón de sastre la aplicación web Gestask: backlog, tablero, orden manual y cierre de tareas, parte diario, horario, tareas diarias y calendario, sobre **el mismo backend de Supabase** que usa la web. La mini app no cambia ni añade nada en ese backend: llama a las mismas Edge Functions, con los mismos métodos y cuerpos, de modo que la web y la mini app se pueden usar a la vez sobre los mismos datos (ADR-0020).

Todo lo que identifica al proyecto de Supabase y al usuario (URL, clave publicable, email, contraseña) se escribe a mano en su sección «Conexión» y no está en el código ni en el repositorio (S-32). Los ejemplos usan marcadores. Prefijo de requisitos: **GT**.

Se entrega en tres sprints: el 9, conexión y «Tareas»; el 10, «Día a día» y «Calendario» (ADR-0022); y el 11, «Rendimiento» y los parámetros. Este documento cubre los dos primeros.

## Identidad

`gestask`, «Gestask», «Tareas, parte diario, horario y calendario sobre Supabase», icono `tasks`, color `gold`, categoría `productivity`. Sustituye a la mini app en preparación `tasks` (ADR-0008, ADR-0020). Sin base de datos propia: sus datos están en Supabase.

## Conexión

| ID | Requisito |
|---|---|
| GT-01 | La conexión se guarda en `<config>/apps/gestask/config.json` con `PrivateFile` (S-20, P-09). Tiene los cuatro campos de la tabla de abajo; un campo vacío se guarda como `null` y se puede guardar a medias. Un fichero ilegible o con un formato no válido se ignora y se parte de una conexión vacía, sin registrar su contenido (S-21). |
| GT-02 | La contraseña nunca sale del servidor: `GET /config` devuelve `passwordSet` en su lugar. Al guardar, si `password` no viene o es `null`, se conserva la guardada; si viene, la sustituye, y la cadena vacía la borra. |
| GT-03 | `GET /config` devuelve además `missing`: los campos que siguen vacíos. Mientras falte alguno, cualquier llamada a Supabase responde 409 `not_configured` con `details.missing`, sin contactar con ningún servidor. |
| GT-04 | Un valor con formato incorrecto se rechaza con 400 `invalid_config` y `details.field`. |
| GT-05 | Guardar la conexión descarta la sesión abierta (GT-12): la siguiente llamada inicia sesión con los valores nuevos. |
| GT-06 | `POST /connection/test` inicia sesión con la conexión guardada, descartando la sesión que hubiera, y responde `{"ok": true}`. Sus errores son los de GT-03 y GT-14. |

| Campo | Clave | Formato |
|---|---|---|
| URL de Supabase | `supabaseUrl` | `https://<servidor>` sin ruta, consulta, usuario ni fragmento, hasta 200 caracteres. Se admite `http://` solo con `localhost` o `127.0.0.1`, para un Supabase local. La barra final se quita. |
| Clave publicable | `publishableKey` | 1 a 500 caracteres ASCII visibles, sin espacios |
| Email | `email` | 3 a 254 caracteres, con `@`, sin espacios |
| Contraseña | `password` | 1 a 200 caracteres |

## Sesión y llamadas a Supabase

| ID | Requisito |
|---|---|
| GT-10 | La interfaz nunca contacta con Supabase: llama a `/api/apps/gestask/fn/<función>` y el servidor de la mini app reenvía la llamada a `<supabaseUrl>/functions/v1/<función>`. La CSP no cambia (S-14). |
| GT-11 | Solo se reenvían las funciones de la tabla «Funciones», cada una con su método, que fija el servidor y no la interfaz. Las de lectura se piden con `GET /fn/<función>` y las demás con `POST /fn/<función>`. Una función que no está en la tabla responde 404 `unknown_function`, y una pedida con el método local equivocado, 405 `method_not_allowed`; ninguna de las dos contacta con Supabase. |
| GT-12 | La sesión es el `access_token` que devuelve `POST <supabaseUrl>/functions/v1/auth-login` con `{"email", "password"}` y la cabecera `apikey`, como hace la web. Vive solo en la memoria del servidor: no se guarda en disco, no se registra y no se envía a la interfaz. Se inicia en la primera llamada que la necesita. |
| GT-13 | Cada llamada reenviada lleva `apikey`, `Authorization: Bearer <token>` y `Content-Type: application/json`, la cadena de consulta tal como llegó y el cuerpo tal como llegó. La respuesta correcta se devuelve tal cual, con 200. |
| GT-14 | **Reinicio de sesión sin perder la llamada.** Si Supabase responde 401 a una llamada reenviada, el servidor inicia sesión de nuevo con la conexión guardada y repite esa misma llamada una vez; la interfaz recibe el resultado como si nada hubiera pasado. Varias llamadas rechazadas a la vez con el mismo token provocan un solo inicio de sesión. Si el inicio de sesión falla, responde 409 `login_failed` con el mensaje de Supabase, y las llamadas que estaban esperando ese inicio de sesión reciben el mismo error sin repetirlo; si la llamada repetida vuelve a recibir 401, responde 502 `session_rejected`. |
| GT-15 | Un error de una función (`{"error": "…"}` con un estado 4xx distinto de 401) se devuelve con ese mismo estado, código `function_error` y ese mensaje. Un 5xx, un 403 o una respuesta que no es JSON responden 502 `supabase_error`. |
| GT-16 | Si no hay contacto con Supabase (red, DNS, tiempo agotado: 10 s para conectar y 30 s por llamada), responde 502 `supabase_unreachable`. No se siguen redirecciones. |
| GT-17 | El único servidor con el que contacta la mini app es el de `supabaseUrl`, y solo en las rutas `/functions/v1/auth-login` y `/functions/v1/<función de la tabla>` (constitución, principio 4; S-15). No registra usuarios (`auth-register`): la cuenta se crea en la web. |

### Funciones

| Función | Método en Supabase | Sprint que la usa |
|---|---|---|
| `tasks-list`, `tasks-completion-list`, `tasks-order-list`, `configuration-list` | GET | 9 |
| `tasks-create` | POST | 9 |
| `tasks-update`, `tasks-completion-resolve`, `tasks-order-update`, `configuration-profile-update` | PATCH | 9 |
| `tasks-delete` | DELETE | 9 |
| `daily-report-get`, `daily-tasks-pending`, `calendar-month-get` | GET | 10 |
| `daily-report-create` | POST | 10 |
| `daily-tasks-complete`, `calendar-day-status-update` | PATCH | 10 |
| `configuration-create` | POST | 11 |

`tasks-list` con `ticket_type=Diaria` devuelve las tareas diarias (GT-100); sin ese parámetro, Supabase las excluye.

## Interfaz común

| ID | Requisito |
|---|---|
| GT-20 | Secciones, cada una con su subruta (N-02) y su nombre en la miga de pan (N-07): «Backlog» (`''`), «Kanban» (`/kanban`), «Ordenar» (`/order`), «Completar» (`/completion`), «Tareas diarias» (`/daily`), «Horario diario» (`/schedule`), «Diarias» (`/routine`), «Calendario» (`/calendar`) y «Conexión» (`/connection`). «Completar» muestra el número de tareas que esperan un paso de cierre, si hay alguna, y «Diarias» el de diarias pendientes (GT-106). |
| GT-21 | Si falta algún campo de la conexión, las secciones de tareas muestran «Falta configurar la conexión» con un botón que lleva a «Conexión», y no piden datos. |
| GT-22 | Al abrirse con la conexión completa carga, en paralelo, las tareas, las tareas a completar, las tareas ordenables, el parte del día elegido (GT-80), las diarias (GT-100), las diarias pendientes (GT-103), el mes del calendario (GT-110) y los parámetros de Gestask. Un fallo se muestra con «Reintentar» sin descartar lo que sí se cargó. «Actualizar» (`Alt+R`) vuelve a cargar todo. |
| GT-23 | No hay sondeos. Al volver a mostrarse la mini app (N-05) después de más de 5 minutos oculta, recarga los datos una vez. |
| GT-24 | Tras una acción que cambia tareas se recarga todo menos los parámetros: las tres listas de tareas, el parte, las diarias, las pendientes y el mes del calendario, que también dependen de las tareas. El resultado de la acción se dice con un aviso del shell (U-05). Mientras se guarda, la acción no se puede repetir. |
| GT-25 | Los colores de una tarea son los de Gestask: fondo según el estado (y la prioridad en `To do`) y borde izquierdo según el estado PR cuando está en `Done`, mezclados con la superficie del tema. El tipo es una etiqueta de color (`Bug`, `Feature`, `Task`). |
| GT-26 | El ticket es un enlace si el parámetro `project-external-page` tiene valor: sustituye `{ticket}` si aparece, o lo añade al final tras una barra. Se abre fuera de la aplicación (`target="_blank"`, `rel="noreferrer"`). Sin valor, es texto. |
| GT-27 | Los diálogos se cierran con Esc y con «Cancelar» sin hacer nada, y llevan el foco a su primer campo. |

## Backlog

| ID | Requisito |
|---|---|
| GT-30 | Tabla con una fila por tarea: ticket, número de comentarios (si tiene), título y más info; tipo, asignación, límite, finalización, scoring, orden y las acciones «Editar» y «Clonar». Los valores vacíos se muestran como «—». Pulsar una fila, o Enter con el foco en ella, abre su detalle. Las tareas `Diaria` no aparecen. |
| GT-31 | Filtros, aplicados en la interfaz sin volver a pedir datos: texto (en título, ticket y más info, sin distinguir mayúsculas), prioridad, fecha (de asignación o de finalización) y estados (varios a la vez). «Limpiar filtros» los quita todos. |
| GT-32 | Sin «Histórico completo» no se muestran las tareas cerradas: `Undone`, `Unfinished`, `Done` con `Deployed`, y `Done` de tipo `Task` con `Imputed`. |
| GT-33 | La ordenación (campo y dirección) la hace Supabase: cambiarla vuelve a pedir `tasks-list` con `sort_by` y `sort_direction`. Por defecto, `created_at` descendente. |
| GT-34 | Filtros y ordenación se recuerdan entre sesiones (P-14). |
| GT-35 | «Crear tarea» (`Alt+N`) abre el formulario con el orden siguiente al mayor `order_points` de las tareas no cerradas (1 si no hay ninguna) y, si los parámetros `project-ticket-model` y `project-ticket-order` tienen valor, con el ticket siguiente: la primera serie de `X` del modelo se sustituye por el número, relleno con ceros hasta su longitud; sin `X`, el número se añade al final. |
| GT-36 | Formulario de tarea: título (obligatorio), ticket, tipo, prioridad, fecha de asignación (obligatoria, hoy por defecto), fecha límite, puntos de esfuerzo (3 por defecto, mínimo 0) y de orden, y más info. Al editar, además: estado, estado PR (solo con `Done`; para `Task`, solo `Not Finished`, `Need to Impute` e `Imputed`) y fecha de finalización (solo con `Done`; al pasar a `Done` se propone hoy). Guarda con `tasks-create` o `tasks-update`. |
| GT-37 | Al crear una tarea con el ticket propuesto sin cambiar, se avanza el contador: `configuration-profile-update` con el valor siguiente de `project-ticket-order`, con el mismo número de cifras. Si ese guardado falla, la tarea queda creada y se avisa del fallo. |
| GT-38 | «Clonar» abre el formulario de creación con los datos de la tarea, sin fecha de finalización ni comentarios, y con orden y ticket nuevos como en GT-35 (si no hay numeración, conserva el ticket). |
| GT-39 | Al editar, «Eliminar tarea» pide confirmación diciendo que no se puede deshacer y llama a `tasks-delete`. |

## Detalle de tarea

| ID | Requisito |
|---|---|
| GT-40 | Diálogo con ticket, tipo, prioridad, estado, estado PR, scoring, fechas, esfuerzo, orden, más info y, si existen, fecha de imputación, enlace al PR y test cases. «Editar» abre el formulario. |
| GT-41 | El estado y el estado PR se cambian desde el detalle con `tasks-update` (`{id, task_status}` o `{id, pr_status}`). El estado PR solo se puede cambiar con la tarea en `Done`. |
| GT-42 | Comentarios, el más reciente primero, con su fecha. «Añadir comentario» envía `tasks-update` con `{id, comment}`; un comentario vacío no se envía, y si el guardado falla se conserva lo escrito. |
| GT-43 | Desde «Completar» el detalle es de solo lectura, salvo los comentarios. |

## Kanban

| ID | Requisito |
|---|---|
| GT-50 | Una columna por estado, salvo `Undone` y `Unfinished`, con su número de tareas. No aparecen las `Done` con estado PR `Imputed` o `Deployed`. |
| GT-51 | Dentro de cada columna, por `order_points` descendente. Cada tarjeta muestra ticket, orden, título, tipo, prioridad, esfuerzo, fecha límite y, en `Done`, el estado PR. Pulsarla abre su detalle. |
| GT-52 | Arrastrar una tarjeta a otra columna cambia su estado con `tasks-update`. El selector de estado del detalle es la alternativa con teclado. |

## Ordenar

| ID | Requisito |
|---|---|
| GT-60 | Lista de `tasks-order-list` en el orden recibido, con posición, ticket, título, tipo, prioridad, estado, fechas y puntos de orden. |
| GT-61 | «Mover arriba» y «Mover abajo» (desactivados en la primera y la última), y arrastrar una fila a cualquier posición. La tarea movida toma el `order_points` de la que ocupaba el destino; las que quedan entre el origen y el destino suman 1 si se movió hacia abajo y restan 1 si se movió hacia arriba. |
| GT-62 | «Ordenar automáticamente» renumera de 1 a N por `order_points` ascendente; con empates, primero la más reciente. |
| GT-63 | Cada movimiento se guarda con una sola llamada a `tasks-order-update` que lleva solo las tareas cuyo valor cambia, y después se recargan las listas (GT-24). Si nada cambia, no se llama y se dice que el orden ya está actualizado. Si falla, la lista queda como estaba. |

## Completar

| ID | Requisito |
|---|---|
| GT-70 | Tabla de `tasks-completion-list` ordenada por estado PR (`Need PR`, `Need to Impute`, `Imputed`) y, dentro, por fecha de finalización ascendente. Columnas: tarea, tipo, finalización, horas, estado PR y la acción de su paso: «Informar PR», «Imputar» o «Cerrar». La acción está desactivada si el tipo no tiene ese paso (`Task` no tiene «Informar PR» ni «Cerrar»). |
| GT-71 | Encima, un resumen con el número de tareas en cada paso. |
| GT-72 | Las horas de una tarea son `effort_points × Minute_PE / 60`, con 60 si el parámetro `Minute_PE` falta o no es un número mayor que 0. |
| GT-73 | «Informar PR»: enlace al PR opcional y, solo en `Feature`, test cases opcionales. Envía `tasks-completion-resolve` con `{id, pr_link}` y, en `Feature`, `test_cases`. |
| GT-74 | «Imputar»: muestra ticket, título, fecha de resolución, horas y «Hora Jira» con «Copiar»; pide la fecha de imputación, que nace con la de finalización (hoy si falta). Envía `{id, imputed_date}`. |
| GT-75 | «Hora Jira» es `<horas> <dd>/<mes>/<aa> 08:00 AM`: las horas como `3h 30m`, `4h` o `45m`, y el mes de la fecha de finalización abreviado con tres letras en español. No existe si la tarea no tiene fecha de finalización. |
| GT-76 | «Cerrar»: avisa de que hay que cerrar la tarea en el sistema externo y envía `{id}`. |
| GT-77 | «Copiar para Jira (N)» copia al portapapeles una línea `<ticket> <Hora Jira>` por cada tarea en `Need to Impute`, por fecha de finalización ascendente. Las que no tienen ticket, fecha u horas no se copian, y se dice cuántas son. |
| GT-78 | Imputación masiva: tabla de las tareas en `Need to Impute` con casilla, una fecha común (hoy por defecto) y los totales de horas, de todas y de las marcadas. «Imputar seleccionadas (N)» pide confirmación y envía una llamada por tarea, en orden. |
| GT-79 | «Informar PR de todas (N)» y «Cerrar imputadas (N)» piden confirmación y envían una llamada `{id}` por tarea, en orden. Si una llamada falla, se detiene, se dice el error y se recargan los datos. |

## Tareas diarias (parte diario)

| ID | Requisito |
|---|---|
| GT-80 | El parte que se muestra es el del día elegido, que empieza en hoy y es el mismo en «Tareas diarias» y en «Horario diario». Selector de día en las dos: «Día anterior», la fecha, «Día siguiente» y «Hoy» (desactivado si ya es hoy). Cambiar de día pide solo `daily-report-get` con `date` y la ordenación (GT-81); mientras llega, la sección dice que está cargando y no muestra el parte de otro día. |
| GT-81 | Ordenación con los campos de GT-33, por defecto `order_points` descendente, que se envía a `daily-report-get` como `sort_by` y `sort_direction`; cambiarla vuelve a pedir solo esa función. No se recuerda entre sesiones, como en la web. |
| GT-82 | Tabla de las tareas del parte (`tasks`, que no incluye las diarias) en el orden recibido, con su número: tarea (como en GT-30), tipo, asignación, límite, scoring, orden, estado y estado PR. Pulsar una fila, o Enter con el foco en ella, abre su detalle. Sin parte para ese día: «No existe parte diario para esta fecha.» |
| GT-83 | Si el parte es editable (`editable`: el de hoy, según Supabase), el estado y el estado PR se cambian en la tabla con `tasks-update` (`{id, task_status}` o `{id, pr_status}`), con las reglas de GT-41. Si no lo es, se avisa «Modo histórico: el parte de un día anterior es de solo lectura.», la tabla no deja cambiar nada y el detalle es de solo lectura salvo los comentarios, como en GT-43. |
| GT-84 | «Nuevo día» crea el parte de hoy con `daily-report-create`, sin cuerpo. Dice cuántas diarias obligatorias añadió (`added_daily_tasks`), si añadió alguna, elige hoy y recarga como tras cualquier cambio (GT-24). Si el parte ya existe, Supabase responde 409 y se dice su mensaje. |

## Horario diario

| ID | Requisito |
|---|---|
| GT-90 | Agenda del parte del día elegido (GT-80), calculada en la interfaz como en la web. Las tareas del parte van por `order_points` descendente (sin orden cuenta como 0) y, con el mismo orden, primero la creada antes. Empieza con un bloque «Daily» de 60 minutos desde la hora de inicio, y cada tarea ocupa a continuación `effort_points × Minute_PE` minutos (GT-72); las de esfuerzo 0 no aparecen. |
| GT-91 | En jornada no intensiva, cuando una tarea llega a la hora de descanso se inserta un bloque «Descanso» de su duración, y la tarea que lo cruza se parte en dos bloques. Se planifica hasta la hora de fin: la tarea que no cabe entera termina en ella con la marca «Tarea parcial», y las siguientes no aparecen. Si el fin no es posterior al inicio, no hay agenda. |
| GT-92 | La jornada sale de los parámetros de la tabla de abajo. Uno que falta o no es válido toma su valor por defecto, y también un objetivo, una duración o unos puntos extra que no son mayores que 0. Un día es intensivo si su día de la semana (1 lunes … 7 domingo) está en `dias_semana_intensivo` o su mes en `meses_intensivo`: usa entonces el inicio, el fin y el objetivo intensivos, y no tiene descanso. |
| GT-93 | Cabecera: «Horario intensivo» si lo es, los puntos planificados frente al objetivo del día (`9 / 12 PE`) y el rango de la jornada. Las horas se muestran como `H:MM` sumando `hora_horario_offset` horas y dando la vuelta a medianoche; el desplazamiento solo cambia lo que se muestra. |
| GT-94 | Al final de la agenda, «Incluir horas» alarga el fin en `PE_diario_extra × Minute_PE` minutos y pasa a «Mostrar menos horas», que lo deshace. No se guarda ni cambia la jornada: vuelve a su estado inicial al cambiar de sección. |
| GT-95 | Cada bloque de tarea muestra sus horas de inicio y fin, ticket (GT-26), esfuerzo, «Tarea parcial» si lo es, orden, título y más info, con los colores de GT-25; pulsarlo abre su detalle. Sin parte: «No existe parte diario para mostrar el horario.»; si la agenda queda vacía (GT-91): «No hay tareas con esfuerzo para planificar en el horario diario.» |
| GT-96 | Encima de la agenda, si el parte tiene diarias (`daily_tasks`), la lista «Tareas diarias» con «N / M realizadas» y una casilla por diaria para marcarla (GT-104). |

| Parámetro | Por defecto | Uso |
|---|---|---|
| `hora_inicio` | `8:00` | Inicio de la jornada (`H:MM`, de 0:00 a 23:59) |
| `hora_fin` | `17:30` | Fin de la jornada |
| `hora_descanso` | `14:00` | Inicio del descanso |
| `duracion_descanso` | `60` | Minutos de descanso |
| `PE_diario` | `12` | Objetivo de puntos de esfuerzo del día |
| `hora_inicio_intensivo` | `8:00` | Inicio de la jornada intensiva |
| `hora_fin_intensivo` | `15:00` | Fin de la jornada intensiva |
| `PE_diario_intensivo` | `9` | Objetivo de la jornada intensiva |
| `dias_semana_intensivo` | `5` | Días de la semana intensivos, separados por comas |
| `meses_intensivo` | `7,8` | Meses intensivos, separados por comas |
| `PE_diario_extra` | `3` | Puntos que añade «Incluir horas» |
| `hora_horario_offset` | `0` | Horas que se suman a las que se muestran |

## Diarias

| ID | Requisito |
|---|---|
| GT-100 | Las tareas `Diaria` se piden con `tasks-list` y `ticket_type=Diaria`, `sort_by=created_at` y `sort_direction=asc`, como en la web. «Activas» (sin fecha de finalización): tarea, «Desde» (fecha de asignación) y las acciones «Editar» y «Finalizar». «Finalizadas», plegada y solo si hay alguna: tarea, fecha de finalización, «Editar» y «Reactivar». |
| GT-101 | «Nueva tarea diaria» abre un formulario reducido: título (obligatorio), ticket, fecha de inicio (obligatoria, hoy por defecto) y más info. Al editar, además, el estado «Activa» (`To do`) o «Finalizada» (`Done`) y «Eliminar tarea», que pide confirmación diciendo que también borra su historial de partes. Envía lo mismo que la web: esos campos con `ticket_type: "Diaria"`, `effort_points: 0`, `order_points: null` y `limit_date: null`, y al editar `id` y `task_status`. |
| GT-102 | «Finalizar» pide confirmación diciendo que dejará de añadirse a los partes nuevos y envía `tasks-update` con `{id, task_status: "Done"}`. «Reactivar» envía `{id, task_status: "To do"}` sin confirmación. |
| GT-103 | «Pendientes de realizar»: las de `daily-tasks-pending`, agrupadas por la fecha de su parte en orden ascendente. Cada grupo lleva la fecha larga en español y «Atrasada» si es anterior al `today` de la respuesta, u «Hoy» si no. Sin pendientes: «Todas las tareas diarias están realizadas.» |
| GT-104 | Cada diaria pendiente, y cada una de la lista del horario (GT-96), tiene una casilla que envía `daily-tasks-complete` con `{task_id, report_date, completed}`. Mientras se guarda, la casilla muestra el valor nuevo y no se puede usar; después se recargan solo las pendientes y el parte. Si falla, se dice el error y la casilla vuelve a su valor. |
| GT-105 | «Marcar todas como realizadas (N)», solo si hay pendientes y desactivado mientras se guarda alguna, pide confirmación diciendo cuántas son y cuántas de días anteriores, y envía una llamada por pendiente, en orden. Si una falla, se detiene, dice cuántas se marcaron y el error; al terminar se recargan las pendientes y el parte. |
| GT-106 | La pestaña «Diarias» muestra el número de pendientes, en rojo si alguna es de un día anterior y en ámbar si todas son de hoy, con el texto «N tareas diarias de días anteriores sin realizar» o «N tareas diarias de hoy por realizar». Sin pendientes no muestra nada. |

## Calendario

| ID | Requisito |
|---|---|
| GT-110 | El mes que se muestra empieza en el actual. Selector: «Mes anterior», el mes, el año (de 2000 a 2100), «Mes siguiente» y «Mes actual» (desactivado si ya es el actual). Cambiar de mes pide solo `calendar-month-get` con `year` y `month`, y un año fuera de ese rango no pide nada; mientras llega, la sección dice que está cargando y no muestra otro mes. |
| GT-111 | Cuadrícula de lunes a viernes, sin sábados ni domingos, que empieza en la columna del primer día laborable del mes. Cada día muestra número y nombre, su tipo si no es «Laboral», «Hoy» si lo es (`is_today`), la observación (hasta 70 caracteres, entera al pasar el ratón) y sus tareas cerradas (`completed_tasks`) con ticket o título y esfuerzo, con el color de su tipo. Pulsar una tarea abre su detalle. |
| GT-112 | Un día «Laboral» muestra los puntos completados frente al objetivo de ese día (`PE_diario`, o `PE_diario_intensivo` si es intensivo, GT-92), sus horas (GT-72, con el formato de GT-75) y una barra de progreso que llega como mucho al 100 %. |
| GT-113 | Cada día se colorea como no laborable (Vacaciones, Festivos o Ausencia), hoy, futuro (sin valorar), objetivo cumplido (puntos completados iguales o mayores que el objetivo del día) o por debajo. Una leyenda explica los colores de objetivo cumplido, por debajo y no laborable (ADR-0022). |
| GT-114 | Pulsar un día, o Enter con el foco en él, abre un diálogo con «Tipo de día» (`Laboral`, `Vacaciones`, `Festivos` o `Ausencia`) y «Observaciones». «Guardar» envía `calendar-day-status-update` con `{day, status, note}`, con la observación sin espacios a los lados o `null` si queda vacía, y recarga solo el mes. |

## API de la mini app

Prefijo `/api/apps/gestask`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | /config | La conexión sin la contraseña, `passwordSet` y `missing` (GT-02, GT-03) |
| PUT | /config | Guarda la conexión (GT-01 a GT-05) |
| POST | /connection/test | Inicia sesión para comprobar la conexión (GT-06) |
| GET | /fn/{función} | Reenvía una función de lectura (GT-10 a GT-16) |
| POST | /fn/{función} | Reenvía una función de escritura con su método real (GT-11) |

## Fuera de alcance

- Cambiar, añadir o desplegar nada en Supabase: Edge Functions, SQL o configuración.
- Registrar usuarios y cambiar la contraseña.
- El «Gestor de tiempos», que en la web solo guarda en el navegador (ADR-0020).
- El tema, el menú lateral y los avisos propios de la web: se usan los del shell.
- «Rendimiento», la configuración de parámetros y las «horas revisadas» de la imputación, que dependen de las métricas de rendimiento: llegan en el sprint 11.
- El botón «Ir al Backlog» del parte y del horario, y el salto al Backlog desde una tarea del calendario: aquí se abre el detalle de la tarea (ADR-0022).
- Trabajar sin conexión y guardar una copia local de las tareas.
