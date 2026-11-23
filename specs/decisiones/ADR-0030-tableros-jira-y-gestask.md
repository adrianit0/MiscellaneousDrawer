# ADR-0030: Crear y abrir tareas de «Gestask» desde «Tableros Jira»

- Estado: aceptada (2026-11-23, con las respuestas del usuario y la aprobación del plan del sprint 16)
- Requisitos: P-33, GT-121 a GT-124 y JR-50 a JR-53 (nuevos); cambian P-12, P-17, P-29, «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`, y la lista «Fuera de la plataforma» de `diseno/mini-apps.md`
- Modifica: constitución, principio 3, que admite además abrir otra mini app en una subruta suya. No cambia la lista de destinos autorizados (principio 4): nada nuevo sale de la máquina

## Contexto

«Gestask» nació porque el Jira Server de la empresa no daba tokens de API: para controlar las tareas había que volver a crearlas a mano en Gestask. Con Jira Cloud ya hay token, y «Tableros Jira» (ADR-0027) muestra los tickets directamente. El usuario pidió (2026-11-23):

1. En cada tarjeta de «Tableros Jira», un botón **(+)** si su ticket no existe en Gestask, que abra Gestask con el formulario de creación relleno con los datos del ticket.
2. Si ya existe, un botón **(>)** en su lugar, que abra esa tarea en Gestask.
3. Que la cabecera de «Tableros Jira» se quede fija arriba.

Hay dos problemas de plataforma:

- **Saber qué tickets tiene Gestask.** Una mini app no lee los datos de otra (principio 3), y los de Gestask están en Supabase, detrás de su servidor (ADR-0020).
- **Abrir otra mini app en una sección suya**, que figuraba en «Fuera de la plataforma, por ahora» a la espera de un uso real (ADR-0025).

Preguntas resueltas con el usuario (2026-11-23):

- **Cómo sabe «Tableros Jira» qué tickets existen**: por el buzón (P-29). Cada vez que Gestask carga su lista de tareas, su servidor envía la lista de tickets. Se acepta que un cambio hecho en la web de Gestask no se note hasta abrir Gestask aquí. Se descarta una pregunta directa entre servidores.
- **Qué se rellena al crear**: el ticket (la clave de Jira), el título (el resumen) y la prioridad si su nombre es una de las de Gestask. Si no, se pidió dejarla vacía, pero el formulario de Gestask no admite una tarea sin prioridad: queda la que pone por defecto, `Menor` (GT-36). El tipo no se rellena.
- **«Pegado a la parte superior»** quiere decir que la cabecera se queda fija mientras se desplaza el tablero, con los títulos de las columnas.

## Decisión

Plan del sprint 16, aprobado por el usuario (2026-11-23):

- **`openApp(id, subruta)` en `useMiniApp()` (P-33).** Abre otra mini app en esa subruta, con entrada en el historial, como si el usuario la abriera. La subruta puede llevar una consulta (`/new?ticket=…`), que la destinataria lee de su `path`. Es la única forma de que una interfaz lleve a otra: no se importa su código ni se pasan objetos (P-18).
- **La lista de tickets va por el buzón.**
  - Gestask la envía (GT-121) cada vez que reenvía con éxito su `tasks-list` principal, el que no lleva `ticket_type` y trae todas las tareas salvo las diarias. Solo la envía si cambió desde el último envío. Como con los PE (GT-120), la respuesta no cambia y un fallo no la estropea.
  - «Tableros Jira» la guarda en su base, sustituyendo la anterior (JR-50), y su interfaz la pide al mostrarse (JR-52), sin consultar Jira ni vaciar la caché de tickets (JR-46).
  - Es una lista que se sustituye, así que un mensaje repetido no tiene efecto (P-30).
- **El límite de un mensaje pasa de 4 KB a 64 KB (P-29).** Una clave de Jira ocupa unos 12 bytes en JSON, y con 4 KB solo cabrían unas 300 tareas; con 64 KB caben más de 4000. Se sigue enviando un solo mensaje con la lista entera, sin trocearla. Una lista que no cabe no se envía, y se registra.
- **Gestask atiende dos subrutas de entrada** y después vuelve a «Backlog» sin dejar la entrada en el historial (GT-124):
  - `/new?ticket=&title=&priority=` (GT-122): abre el formulario de creación relleno. Si Gestask ya tiene una tarea con ese ticket, abre su detalle en lugar de crear otra: protege de una lista que todavía no ha llegado a «Tableros Jira».
  - `/ticket/<clave>` (GT-123): abre el detalle de la tarea con ese ticket.
- **La cabecera fija (JR-53).** La mini app ocupa el alto de su área, y en «Tableros» solo se desplaza el tablero, en vertical y en horizontal, con los nombres de las columnas fijos. Para que una mini app pueda ocupar ese alto, el marco del shell (`.app-frame`) pasa de `min-height: 100%` a `height: 100%`. Para las demás mini apps no cambia nada: su contenido sigue desplazándose en el área del shell.

## Alternativas descartadas

- **Pregunta directa entre servidores** (una consulta síncrona de «Tableros Jira» a Gestask). Siempre estaría al día, pero añade a la plataforma un canal nuevo entre mini apps, con su contrato, sus errores y sus pruebas, para un uso. El usuario eligió el buzón.
- **Que «Tableros Jira» llame a Supabase.** Duplicaría la conexión de Gestask y su contraseña, y ampliaría el principio 4 (ya se descartó en ADR-0025).
- **Mensajes por ticket** (alta y baja) en lugar de la lista. Evitaría subir el límite, pero exige una lista base, y tras cada arranque se enviarían cientos de mensajes.
- **Trocear la lista en varios mensajes.** Exige reconstruirla en el destino y saber cuándo está completa.
- **Pasar los datos de la tarea en un objeto** en lugar de la subruta. Ataría las dos interfaces; la subruta es texto y se puede probar y documentar como cualquier otra.
- **Cabecera pegajosa sobre el área del shell**, sin desplazamiento propio. La barra de desplazamiento horizontal del tablero seguiría al final de todos los tickets, y los nombres de las columnas no podrían quedarse fijos.

## Consecuencias

- **Migración `V003` de «Tableros Jira»**, con su copia previa (P-08): la tabla `gestask_ticket`.
- **Cambia el principio 3**: además de los mensajes, una interfaz puede abrir otra mini app en una subruta.
- **`AppBoundariesTest` y `boundaries.test.ts` no cambian**: las mini apps se nombran solo por su identificador.
- **Gestask y «Tableros Jira» quedan acoplados** por dos contratos de texto: el mensaje `gestask-tickets` y las subrutas `/new` y `/ticket/<clave>`. Los dos están en sus requisitos, y cada mini app los prueba por su lado.
- **Queda fuera**:
  - Mantener la lista al día sin abrir Gestask.
  - Rellenar el tipo y otros campos.
  - Que Gestask avise a Jira de nada: el principio 4 no cambia.
  - Mensajes desde la interfaz de una mini app sin servidor.
