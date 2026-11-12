# Sprint 4: Notificaciones de la plataforma

## Objetivo

Que cualquier mini app pueda dejar constancia de algo que ha ocurrido con una línea de código, y que el usuario lo vea en un único sitio: una campana arriba a la derecha con las últimas notificaciones, que llevan a su mini app y se limpian con un botón. Con sonido y notificación de escritorio opcionales desde «Ajustes». «Base de datos» es el primer uso.

## Requisitos cubiertos

- Plataforma: P-21 a P-24 (nuevos) y P-05.
- Navegación: N-11 a N-13 (nuevos) y N-07.
- Interfaz, datos y API: U-05, U-06, D-04, D-05 y las rutas `/api/notifications` y `/api/events`.
- Base de datos: BD-01, BD-17 y BD-65.

Documentos: [ADR-0013](../decisiones/ADR-0013-notificaciones.md), [requisitos/plataforma.md](../requisitos/plataforma.md), [requisitos/navegacion.md](../requisitos/navegacion.md), [diseno/mini-apps.md](../diseno/mini-apps.md) («Notificaciones»).

## Tareas

1. **Especificación.** ADR-0013, los requisitos nuevos y modificados, `modelo-datos.md`, `arquitectura.md` y la sección «Notificaciones» de `mini-apps.md`.
2. **Plataforma.** `Notifications`, `NotificationKind` y `AppContext.notifications()`.
3. **Servidor del shell**, paquete `dev.cajonsastre.notifications`.
   - Migración `V002__notifications.sql` y `NotificationMapper`.
   - `NotificationCenter`: validar, guardar, conservar 50, listar, limpiar y repartir (P-21 a P-23).
   - `DesktopAnnouncer`: `notify-send` y `paplay` según los ajustes (P-24).
   - `AppConfig`: `notificationSound` y `desktopNotifications` (D-05).
   - `LifecycleApi`: eventos con nombre por `/api/events` (P-23).
   - `AppRegistry` y `Main`: cada mini app recibe sus notificaciones.
4. **Interfaz del shell.**
   - `presence.ts`: leer los eventos del canal.
   - `notificationStore.ts` y `NotificationBell.tsx`: campana, contador, desplegable, abrir la mini app y «Limpiar todo» (N-11 a N-13).
   - «Ajustes»: categoría «Notificaciones» (U-06).
5. **«Base de datos».** `JobRunner` emite por la plataforma; se retiran `notifyOnFinish`, sus comandos y el grupo «Avisos» de su configuración (BD-17).
6. **Documentación.** `README.md` y `CLAUDE.md`.
7. **Verificación.** `./mvnw verify` en verde y los criterios de aceptación con la aplicación arrancada.

Orden: primero las pruebas de cada requisito y después su código. Commits pequeños en español; ningún push, porque publicaría una versión (R-01).

## Criterios de aceptación

- `./mvnw verify` termina en verde, con las pruebas de fronteras incluidas.
- Una mini app emite una notificación con una llamada a `context.notifications()` y no importa nada fuera de `platform` (P-18).
- La campana está arriba a la derecha, entre «Ir a…» y «Ajustes», y muestra el número de notificaciones sin leer.
- El desplegable lista las notificaciones de la más reciente a la más antigua, con su mini app, su título y su fecha. Al abrirlo, el contador se pone a cero y sigue así tras recargar la ventana.
- Pulsar una notificación abre su mini app y cierra el desplegable.
- «Limpiar todo» vacía la lista, también tras recargar.
- Una notificación emitida con la ventana abierta aparece sin recargar.
- Las notificaciones sobreviven a un reinicio de la aplicación y nunca hay más de 50.
- «Ajustes → Notificaciones» tiene «Sonido» y «Notificación de escritorio», marcadas por defecto; desmarcadas, no se lanza su comando.
- Un trabajo de «Base de datos» que termina deja su notificación, de éxito o de error; uno cancelado, no. Su configuración ya no tiene «Aviso al terminar».
- En Ubuntu: al terminar un trabajo suena el aviso y aparece la notificación de escritorio.

## Resultado

Fecha: 2026-11-12. Hecho en el código, probado y recorrido con la aplicación arrancada en Windows; falta comprobar en Ubuntu el sonido y la notificación de escritorio reales. Sin commits todavía.

### Hecho

- **Especificación:** ADR-0013 aceptada; P-21 a P-24 y N-11 a N-13 nuevos; cambios en P-05, N-07, U-05, U-06, D-04, D-05, la API, BD-01, BD-17, BD-65, `modelo-datos.md`, `arquitectura.md`, ADR-0011 y la sección «Notificaciones» de `mini-apps.md`.
- **Plataforma:** `Notifications`, `NotificationKind` y `AppContext.notifications()`. Emitir es una línea: `context.notifications().send("…", NotificationKind.SUCCESS)`.
- **Servidor (`dev.cajonsastre.notifications`):** `NotificationCenter` (valida, guarda, conserva 50, lista, limpia y reparte), `NotificationMapper` con la migración `V002__notifications.sql`, y `DesktopAnnouncer` (`notify-send` y `paplay` según los ajustes, sin esperar a los comandos).
- **Shell:** `AppConfig` con `notificationSound` y `desktopNotifications`; `LifecycleApi.broadcast` envía eventos con nombre por `/api/events`; `AppRegistry.start` recibe las notificaciones de cada mini app; `Main` lo conecta todo.
- **Interfaz:** `NotificationBell` y `notificationStore` (campana, contador, desplegable, abrir la mini app y «Limpiar todo»), lectura de eventos en `presence.ts`, categoría «Notificaciones» en «Ajustes» e icono `bell`.
- **«Base de datos»:** `JobRunner` emite por la plataforma; desaparecen `notifyOnFinish`, sus comandos y el grupo «Avisos» de su configuración.
- **Documentación:** `README.md` y `CLAUDE.md`.
- **Pruebas:** 348 de backend y 198 de interfaz.
  - Nuevas de backend: 10 en `NotificationCenterTest`, 1 de P-23 en `LifecycleTest` y 1 de P-24 en `SettingsTest`; las de BD-17 de `DatabaseAppTest` se han reescrito.
  - Nuevas de interfaz: 12 en `shell/notifications.test.tsx`.
  - En Windows se omiten las mismas 19 de backend de los sprints anteriores.

### Criterios de aceptación

1. **`./mvnw verify` en verde:** en Windows 10, con las pruebas de fronteras. **Cumplido.**
2. **Una llamada y sin salir de `platform`:** `JobRunner` solo importa `platform.Notifications` y `platform.NotificationKind`; `AppBoundariesTest` pasa. **Cumplido.**
3. **Campana entre «Ir a…» y «Ajustes», con contador:** prueba N-07 N-11 y, con la aplicación arrancada, «Notificaciones, 1 sin leer». **Cumplido.**
4. **Desplegable ordenado; el contador se pone a cero y sigue así tras recargar:** pruebas N-11 y N-12; con la aplicación arrancada, tras recargar la campana no marcaba ninguna sin leer. **Cumplido.**
5. **Pulsar abre la mini app y cierra:** con la aplicación arrancada llevó de «Configuración» a `#/apps/database`. **Cumplido.**
6. **«Limpiar todo», también tras recargar:** el desplegable quedó en «No hay notificaciones» y `GET /api/notifications` vacío. **Cumplido.**
7. **Aparece sin recargar:** con la aplicación arrancada, un trabajo de «Base de datos» sin `aws` instalado terminó como fallido y la campana pasó a 1 sin tocar la ventana. **Cumplido.**
8. **Sobreviven a un reinicio y nunca más de 50:** prueba P-22. **Cumplido en pruebas.**
9. **Ajustes de sonido y escritorio:** pruebas P-24 y U-06. **Cumplido en pruebas.**
10. **«Base de datos» notifica éxito y error, no la cancelación, y sin «Aviso al terminar»:** pruebas BD-17 y BD-65. **Cumplido.**
11. **Sonido y notificación de escritorio en Ubuntu:** **pendiente.** En Windows no existen `paplay` ni `notify-send`, y no pasa nada.

El registro del shell solo recogió «Trabajo 1 … iniciado» y «terminado: failed», sin el texto de la notificación (S-21).

### Pendiente

- **Verificación en Ubuntu:** que al emitirse una notificación suene `paplay` y aparezca la de `notify-send`, también con la aplicación abierta desde el lanzador, y que cada interruptor de «Ajustes» la silencie.
- **Aspecto:** la campana y el desplegable no se han revisado en pantalla (la captura del navegador de pruebas no respondió); se comprobaron por su contenido y su comportamiento.
- Siguen pendientes los puntos de los sprints anteriores.

### Desviaciones y decisiones

- **ADR-0013 (aceptada):** el sonido lo reproduce el servidor, BD-17 pasa a la plataforma y solo se emite desde el servidor de la mini app.
- **«Notificaciones» y no «Avisos»:** U-05 ya llama avisos a los mensajes breves de abajo a la derecha. Lo nuevo se llama notificación en la especificación, en la campana y en «Ajustes».
- **Quien tuviera «Aviso al terminar» desactivado** en «Base de datos» debe desmarcar ahora los dos interruptores de «Ajustes»: el valor antiguo se ignora.
- **`AppRoutes.valid` pasa a ser público** para validar con la misma regla la subruta de una notificación.
- **Las no leídas se calculan con el identificador de la última vista** (`shell.notificationsSeen`), por eso la tabla usa `AUTOINCREMENT`: tras «Limpiar todo» los identificadores no se reutilizan.
- **Los comandos de escritorio se lanzan sin esperarlos**, para no retener el hilo de la mini app que notifica.

### Cómo usarlo desde una mini app nueva

1. En `start(AppContext context, AppRoutes routes)`, guardar `context.notifications()`.
2. Cuando ocurra algo: `notifications.send("Título", NotificationKind.SUCCESS)`, o con texto y subruta: `notifications.send("Título", "Detalle", NotificationKind.ERROR, "/seccion")`.
3. En sus pruebas, pasar un `Notifications` propio como cuarto argumento de `AppRegistry.start` y comprobar lo emitido.
