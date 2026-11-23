# Sprint 12: Mini apps «Lootboxes» e «Inventario»

## Objetivo

Un rato de ocio para la Daily, de 20 minutos como mucho: cofres que se consiguen con los PE cerrados en «Gestask» (uno por PE, hasta 8 al día), se desbloquean a las 8:00 del día siguiente y se abren con una animación breve; sus objetos se guardan en el inventario. Conseguir un cofre no se nota mientras se trabaja (ADR-0026). Para unir las tres mini apps, la plataforma gana un buzón de mensajes (ADR-0025).

## Requisitos cubiertos

- Plataforma: P-29 a P-32 (nuevos); P-02 (categoría `leisure` e iconos nuevos `chest` e `inventory`) y P-05.
- Navegación: L-01 (grupo «Ocio»). Datos: D-04.
- Lootboxes: LB-01 a LB-27. Inventario: IN-01 a IN-21.
- Gestask: GT-120.
- Constitución: principio 3.

Documentos: [requisitos/lootboxes.md](../requisitos/lootboxes.md), [requisitos/inventory.md](../requisitos/inventory.md), [requisitos/plataforma.md](../requisitos/plataforma.md), [ADR-0025](../decisiones/ADR-0025-mensajes-entre-mini-apps.md), [ADR-0026](../decisiones/ADR-0026-mini-apps-de-ocio.md), [diseno/mini-apps.md](../diseno/mini-apps.md).

## Tareas

1. **Especificación.** Requisitos LB e IN, P-29 a P-32, GT-120, P-02, L-01, D-04, el modelo de datos, el diseño de mini apps, el principio 3, ADR-0025 y ADR-0026, y este sprint.
2. **Buzón de la plataforma.**
   - `platform/Messages` y `platform/Message`; `AppContext.messages()`.
   - `messages/MessageCenter` y su mapper sobre la tabla `app_message` (migración `db/shell/V003__app_messages.sql`).
   - `AppRegistry` da a cada mini app su buzón, con su identificador como remitente; las pruebas pueden pasar uno propio.
3. **Catálogo.** Categoría `leisure` («Ocio») en Java y en la interfaz, con su sitio en el lanzador; iconos `chest.svg` e `inventory.svg`; manifiestos de `lootboxes` e `inventory`. `AppCatalogTest` se adapta.
4. **«Gestask».** Tras reenviar `calendar-month-get`, leer los PE de cada día y enviarlos a `lootboxes` sin repetir valores (GT-120).
5. **«Lootboxes»**, paquete `dev.cajonsastre.apps.lootboxes`, con base propia.
   - Migración `V001__initial.sql` y mappers.
   - `LootTable` (LB-12, LB-13) con el azar inyectable para las pruebas.
   - `Chests`: fecha de inicio, PE recibidos, desbloqueo a las 8:00, apertura y entrega al inventario (LB-01 a LB-15).
   - `LootboxesApp` y sus rutas.
   - Interfaz `frontend/src/apps/lootboxes/`: la pantalla, la animación en CSS con su salto y `prefers-reduced-motion`, «Abrir todos» y el resumen (LB-20 a LB-27).
6. **«Inventario»**, paquete `dev.cajonsastre.apps.inventory`, con base propia: migración, recepción idempotente (IN-01 a IN-05), `InventoryApp` y la interfaz `frontend/src/apps/inventory/` (IN-10 a IN-21).
7. **Pruebas.**
   - Backend: el buzón (formato, entrega repetida hasta el `ack`, aislamiento entre mini apps, conservación); GT-120 con `FakeSupabase`; los cofres con un reloj fijo (antes y después de las 8:00, el tope de 8, PE que bajan, días antes del inicio o futuros, mensajes repetidos); la tabla de botín con un azar fijo y la distribución con muchas tiradas; la entrega reintentada al inventario; el inventario con mensajes repetidos, inválidos y rarezas desconocidas.
   - Interfaz: estados vacío, con cofres y con error; animación saltada y reducida; «Abrir todos» con confirmación; inventario ordenado por rareza.
8. **Documentación.** `README.md` y `CLAUDE.md` (prefijos LB e IN, el buzón en la estructura).
9. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada y datos aislados.

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- «Lootboxes» e «Inventario» aparecen en el lanzador, en el grupo «Ocio», el último.
- Con Supabase simulado y el reloj fijo de las pruebas: al abrir «Gestask» con un día de hoy de 5,5 PE cerrados, «Lootboxes» no muestra nada hoy; con el reloj en mañana a las 7:59 sigue sin mostrar nada, y a las 8:00 muestra 5 cofres. Con 11 PE serían 8.
- Ni «Gestask», ni el lanzador, ni la campana, ni las consolas dicen nada de los cofres conseguidos.
- Abrir un cofre muestra la animación en 3 s como mucho, se puede saltar, y da de 1 a 3 orbes; los mismos orbes aparecen en «Inventario» con su cantidad.
- «Abrir todos» abre todos los desbloqueados y muestra el resumen.
- Cerrar la ventana a mitad de una animación no pierde ni repite el cofre.
- Ninguna prueba contacta con un servidor.

## Resultado

Fecha: 2026-11-22. Hecho en el código y probado en las pruebas y con la aplicación arrancada, con Supabase simulado. Sin commits todavía.

### Hecho

- **Especificación:** `requisitos/lootboxes.md` (LB-01 a LB-27) e `inventory.md` (IN-01 a IN-21), P-29 a P-32, GT-120, P-02, L-01, D-04, el modelo de datos, el diseño de mini apps, el principio 3, ADR-0025 y ADR-0026 aceptadas, `README.md` y `CLAUDE.md`.
- **Plataforma:** `Messages` y `Message` en `platform/`, `AppContext.messages()`; `messages/MessageCenter` y `MessageMapper` sobre `app_message` (migración `V003__app_messages.sql`). `AppRegistry.start` recibe el buzón de cada mini app; sin él, lo enviado se descarta.
- **Catálogo:** categoría `leisure` («Ocio»), última en el lanzador; iconos `chest` e `inventory`; `lootboxes` (naranja) e `inventory` (violeta) disponibles.
- **«Gestask»:** `EffortPoints` lee los PE de `calendar-month-get` y los envía a «Lootboxes» sin repetir valores; un fallo no cambia la respuesta y se reintenta en la siguiente carga.
- **«Lootboxes»** (`dev.cajonsastre.apps.lootboxes`), la primera mini app con base propia: `LootTable`, `Chests`, `LootMapper` y `LootboxesApp`. Interfaz con el cofre dibujado en CSS, la animación (temblor de 0,9 s y 0,35 s por recompensa: 2 s con tres), el salto con clic, Enter, Espacio o Esc, `prefers-reduced-motion` y «Abrir todos» con confirmación y resumen.
- **«Inventario»** (`dev.cajonsastre.apps.inventory`): `ItemMapper` e `InventoryApp`, recepción idempotente por cofre, y la cuadrícula de orbes por rareza con las fechas al pasar el ratón o con el foco.
- **Pruebas:** `./mvnw verify` en verde, con 515 de backend (19 omitidas en Windows, las mismas de antes) y 395 de interfaz.
  - Backend nuevas: 7 en `MessageCenterTest`, 4 en `EffortPointsTest`, 3 en `LootTableTest` (con la distribución sobre 300 000 cofres), 13 en `LootboxesAppTest` (reloj que se mueve y «Inventario» real), 4 en `InventoryAppTest`. Adaptadas: `AppCatalogTest`, `AppManifestTest` y `MainTest`.
  - Interfaz nuevas: 17 en `lootboxesApp.test.tsx`, 5 en `inventoryApp.test.tsx` y 1 en `App.test.tsx` (grupo «Ocio»); adaptada `search.test.ts`.
- **Recorrido con la aplicación arrancada** en Windows, con datos aislados y un Supabase simulado en `http://127.0.0.1:54321` (un script fuera del repositorio): al cargar el calendario, «Gestask» deja en el buzón los PE de ayer (5,5) y de hoy (3) y no muestra nada; con la fecha de inicio de hoy, «Lootboxes» descarta el día anterior (queda en el registro sin contenido) y no enseña los 3 cofres de hoy. Tras adelantar la fecha de inicio en la base aislada y volver a cargar el calendario, aparecen «5 cofres para abrir»; uno se abre con el temblor, el destello y dos orbes blancos; «Abrir todos» pide confirmación y resume 1 verde y 6 blancos; «Inventario» muestra 9 objetos (verde ×1, blanco ×8). El lanzador agrupa las dos en «Ocio», la última. Quedan 0 mensajes pendientes y 0 notificaciones, los 5 cofres abiertos están entregados y los 3 de hoy siguen bloqueados.

### Pendiente

- Probar con el Supabase real: que `completed_points` de `calendar-month-get` son los PE cerrados que espera el usuario.
- El desbloqueo a las 8:00 del día siguiente se comprobó en las pruebas con el reloj fijo; con la aplicación arrancada solo se vio con un día ya desbloqueado.

### Desviaciones y decisiones

- **Los mensajes se leen solo al arrancar y en `GET /chests` o `GET /items`**, como dice la especificación; abrir un cofre no lee mensajes nuevos, porque la interfaz siempre pide la lista antes.
- **Un día futuro se juzga al leer el mensaje**, no al enviarlo. Como «Gestask» solo envía días hasta hoy, no ocurre en la práctica.
- **Los PE ya enviados se recuerdan en memoria**: tras reiniciar, «Gestask» los vuelve a enviar al cargar el calendario, y «Lootboxes» no crea cofres de más (LB-04).
- **«Gestask» no recarga el calendario solo por reiniciar el servidor**: si estaba abierta, los PE llegan con la siguiente carga («Actualizar», un cambio en una tarea o al volver tras 5 minutos oculta, GT-23, GT-24).
