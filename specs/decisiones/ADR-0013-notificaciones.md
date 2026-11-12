# ADR-0013: Notificaciones de la plataforma

- Estado: aceptada (2026-11-12, con las respuestas del usuario al plan)
- Requisitos: P-21 a P-24 y N-11 a N-13 (nuevos); N-07, U-06, D-04, D-05, BD-01, BD-17 y BD-65 (modificados)
- Modifica: ADR-0011, que dejó el aviso de fin de trabajo dentro de «Base de datos»

## Contexto

«Base de datos» avisa por su cuenta cuando termina un trabajo: lanza `notify-send` y `paplay`, con su casilla «Aviso al terminar» (BD-17). Las mini apps que lleguen con trabajos largos necesitarán lo mismo, y cada una repetiría los comandos, el ajuste y las pruebas. Además, ese aviso se pierde: si el usuario no estaba delante, al volver no queda rastro de lo ocurrido.

El usuario pidió (2026-11-12) un sistema de notificaciones del shell que las mini apps puedan usar con facilidad: un sonido opcional desde «Ajustes», una sección arriba a la derecha que despliega las últimas notificaciones, que al pulsar una lleve a su mini app, y un botón «Limpiar todo».

En este documento, **notificación** es lo nuevo: algo que ha ocurrido y que se conserva hasta que el usuario lo limpia. Los **avisos** de U-05 siguen siendo los mensajes breves de abajo a la derecha, que desaparecen solos.

## Decisión

Las notificaciones son un servicio de la plataforma. Preguntas hechas al usuario y sus respuestas:

1. **¿Quién reproduce el sonido?** El servidor, con `paplay`, como hacía «Base de datos». Suena una sola vez aunque haya varias ventanas y también sin ninguna, que es el caso de un trabajo largo (P-20). Solo suena en Ubuntu.
2. **¿Qué pasa con BD-17?** Pasa a la plataforma. Toda notificación lanza también `notify-send`. Desaparece la casilla «Aviso al terminar» de «Base de datos», y «Ajustes» gana la categoría «Notificaciones» con dos interruptores: «Sonido» y «Notificación de escritorio».
3. **¿Desde dónde se emite?** Solo desde el servidor de la mini app. La variante para mini apps solo de interfaz se añadirá cuando una la necesite (constitución, principio 8).

Para una mini app, emitir una notificación es una línea:

```java
context.notifications().send("El trabajo ha terminado correctamente", NotificationKind.SUCCESS);
```

Cambios:

- `platform`: `Notifications`, `NotificationKind` y `AppContext.notifications()`.
- Paquete `dev.cajonsastre.notifications`: `NotificationCenter` (guardar, listar, limpiar y repartir) y `DesktopAnnouncer` (`notify-send` y `paplay`).
- Base del shell: tabla `notification` (migración V002), con las 50 últimas. Se guardan en disco porque un trabajo puede terminar sin ventanas y el proceso se apaga 15 s después (C-05): en memoria se perderían justo en ese caso.
- API: `GET` y `DELETE /api/notifications`. Las nuevas llegan a las ventanas abiertas por `/api/events`, que deja de llevar solo latidos.
- Interfaz: campana en la barra superior con su desplegable.
- `AppConfig`: `notificationSound` y `desktopNotifications`, activos por defecto.
- «Base de datos»: `JobRunner` emite la notificación por la plataforma; se retiran `notifyOnFinish` y sus comandos.

## Alternativas

- **Sonido en la ventana** (Web Audio). Funciona también en Windows, pero no suena con la ventana cerrada y Chrome puede bloquearlo si aún no se ha hecho clic en ella.
- **Notificaciones solo en memoria.** Más simple, pero se pierden cuando el proceso se apaga tras un trabajo sin ventanas.
- **Notificaciones del navegador** (`Notification` de la web). Piden un permiso por perfil y tampoco funcionan sin ventana.
- **Que cada mini app guarde y pinte las suyas.** Es lo que se quiere evitar: la campana es una sola y está en el shell.

## Consecuencias

- El contrato de las mini apps crece con `AppContext.notifications()`. Tiene un uso real (`database`).
- `/api/events` lleva ahora eventos con nombre. Sigue siendo el canal de presencia (C-04); los eventos hacia la interfaz de una mini app concreta siguen fuera de la plataforma.
- Un `config.json` de «Base de datos» anterior conserva `notifyOnFinish`, que se ignora y desaparece al guardar. Quien lo tuviera desactivado debe desactivar los interruptores de «Ajustes».
- La configuración de «Base de datos» deja de tener el grupo «Avisos».
- Los iconos de `frontend/src/shell/icons/` ganan `bell`, que como todos queda disponible para los manifiestos (P-02).
