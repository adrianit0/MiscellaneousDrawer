# ADR-0012: Una mini app puede declararse ocupada

- Estado: aceptada (2026-11-11, con la aprobación del plan del Sprint 3)
- Requisitos: P-20 (nuevo), C-05, R-41, BD-18
- Modifica: ADR-0010, que dejó este mecanismo para cuando una mini app lo necesitara

## Contexto

«Base de datos» (ADR-0011) es la primera mini app con trabajos largos: una descarga de varios gigas y una importación pueden durar muchos minutos. Hoy hay dos formas de interrumpirlos sin querer:

- **Cerrar la ventana.** El proceso se apaga 15 s después de que se despida la última ventana (C-05). Una importación a medias deja el contenedor de MySQL inservible hasta repetirla, y como el estado del trabajo solo vive en memoria, al volver a abrir no queda rastro de lo ocurrido.
- **Pulsar «Actualizar».** La aplicación se reinicia. R-41 solo comprueba que los estados de interfaz estén guardados.

ADR-0010 ya lo preveía: «Un mecanismo para que una mini app bloquee la actualización por su cuenta se añadirá cuando alguna lo necesite».

## Decisión

El usuario aprobó el plan del Sprint 3 con esta propuesta incluida (2026-11-11). Un requisito nuevo de plataforma:

> **P-20.** Una mini app puede declararse ocupada mientras hace un trabajo que no debe interrumpirse: `MiniApp.busy()` devuelve el motivo, o vacío. Mientras alguna lo esté, el apagado por falta de ventanas (C-05) se aplaza y se vuelve a comprobar cada 15 s, y «Actualizar» no continúa y dice el motivo (R-41). `cajonsastre --stop`, `POST /api/shutdown` y el instalador apagan igualmente, porque el usuario lo pide de forma expresa, y la mini app cancela su trabajo en `stop()` (P-10).

Cambios:

- `MiniApp`: método `default Optional<String> busy()`, vacío por defecto.
- `AppRegistry`: lista de las mini apps disponibles que están ocupadas, con su motivo. Un fallo al preguntar a una se registra y cuenta como no ocupada.
- `Presence`: antes de apagar por falta de ventanas pregunta si hay alguna ocupada; si la hay, vuelve a comprobar pasado el plazo.
- `POST /api/update/apply`: 409 `app_busy` con el motivo, antes de descargar nada.
- `DatabaseApp.busy()`: «hay un trabajo en marcha» mientras lo haya.

## Alternativas

- **No hacer nada.** Es lo que pasaba con los scripts al cerrar la terminal. Pero una ventana se cierra con más facilidad que una terminal con un proceso a la vista, y la aplicación no avisa.
- **Avisar en la interfaz al cerrar la ventana** (`beforeunload`). No cubre «Actualizar» y obliga a una mini app a engancharse a un evento global de la ventana, que es terreno del shell.
- **Guardar el estado del trabajo en disco** para explicarlo al volver. Explica el daño, pero no lo evita.

## Consecuencias

- El contrato de las mini apps crece con un método opcional. Tiene un uso real (`database`) y dos consumidores (presencia y actualizador).
- Una mini app que se declare ocupada para siempre impediría el apagado automático. Lo limitan que `--stop` siempre apaga y que el motivo queda en el registro cada vez que se aplaza.
