# ADR-0025: Mensajes entre mini apps

- Estado: aceptada (2026-11-22, con las respuestas del usuario y la aprobación del plan del sprint 12)
- Requisitos: P-29 a P-32 (nuevos); P-05, D-04 y la lista «Fuera de la plataforma» de `diseno/mini-apps.md` (modificados)
- Modifica: constitución, principio 3, que admite el intercambio de mensajes a través de la plataforma. No cambia la lista de destinos autorizados (principio 4): los mensajes no salen de la máquina

## Contexto

El usuario pidió (2026-11-22) dos mini apps de ocio, «Lootboxes» e «Inventario» (ADR-0026). Los cofres se consiguen con los PE que el usuario cierra en «Gestask», y las recompensas de los cofres van al inventario. Son dos flujos de datos entre mini apps:

1. «Gestask» → «Lootboxes»: los PE cerrados de cada día.
2. «Lootboxes» → «Inventario»: las recompensas de cada cofre abierto.

Hoy ninguna mini app puede leer ni escribir los datos de otra (constitución, principio 3; P-18), y la comunicación entre mini apps figura en «Fuera de la plataforma, por ahora», a la espera de una mini app real que la necesite. Con dos flujos reales, ya hay dos usos (principio 8).

Se preguntó al usuario si «Lootboxes» e «Inventario» eran una mini app con dos secciones o dos mini apps; eligió dos, sabiendo que eso exige el canal también entre ellas.

## Decisión

La plataforma da a cada mini app un **buzón**: `context.messages()`.

- **Enviar.** `send(destinataria, tipo, contenido)` guarda un mensaje para otra mini app del catálogo. El contenido es un objeto JSON pequeño (hasta 4 KB) y el tipo dice qué es (`effort-points`, `chest-rewards`). El shell añade el remitente y la fecha.
- **Recibir.** La destinataria pide sus mensajes pendientes cuando quiere (`pending()`) y confirma cada uno después de guardarlo en su base (`ack(id)`). Hasta que lo confirma, el mensaje se le vuelve a entregar: la entrega es **al menos una vez**, y la destinataria debe tratar un mensaje repetido sin efecto (idempotencia). No hay transacciones entre bases (ADR-0006), así que es la única garantía posible sin perder datos.
- **Persistencia.** Los mensajes van a la base del shell, en una tabla nueva `app_message`, y se conservan hasta que la destinataria los confirma, sin límite de número: son datos del usuario (principio 7) y su volumen es pequeño (unos pocos al día). Los de una destinataria que deja el catálogo se conservan por si vuelve, como `app_state`.
- **Sin interfaz ni eventos.** Los mensajes no tienen rutas de API ni viajan por `/api/events`: son un asunto entre servidores. Así ninguna mini app ve el buzón de otra y, en el caso de los cofres, la llegada de PE no se nota en ningún sitio (ADR-0026).
- **Errores.** Un destinatario que no está en el catálogo, la propia mini app como destinataria, un tipo o un contenido fuera de formato son errores de programación y lanzan `IllegalArgumentException`. Un fallo al guardar también se lanza: a diferencia de una notificación, quien envía necesita saber si el mensaje quedó guardado para reintentarlo.

## Alternativas descartadas

- **Una sola mini app con dos secciones.** Evitaba el segundo flujo, pero el usuario eligió dos mini apps.
- **Que «Lootboxes» llame a Supabase.** Duplicaría la conexión de «Gestask», con su contraseña, y ampliaría el principio 4 a otra mini app.
- **Datos publicados (clave y valor) que cualquiera lee.** Valdría para los PE, que se sustituyen, pero no para las recompensas: el inventario debe poseerlas, no reflejar lo que dice «Lootboxes».
- **Entrega inmediata con un manejador** (`subscribe`). Exigiría que la destinataria esté arrancada y sin fallos en ese momento, y que el shell reintente por ella. Pedir los mensajes cuando la destinataria los necesita es más simple y no pierde nada si está en `failed`.
- **Eliminar duplicados en el shell** con una clave del remitente. Complica la tabla y no evita la repetición en el lado de la destinataria, que puede caerse entre guardar y confirmar.

## Consecuencias

- **Migración V003 de la base del shell**, con su copia previa (D-02).
- **El principio 3 cambia**: las mini apps siguen sin leer los datos de otra, pero pueden enviarse mensajes por la plataforma.
- **`AppBoundariesTest` no cambia**: una mini app nombra a otra solo por su identificador, sin importar su código.
- **Queda fuera**: abrir un elemento de otra mini app desde la interfaz, y mensajes desde la interfaz de una mini app sin servidor.
