# ADR-0033: Cliente y fechas en las tarjetas de «Tableros Jira»

- Estado: aceptada (2026-11-27, con las respuestas del usuario y la aprobación del plan del sprint 18)
- Requisitos: JR-08 y JR-28 (nuevos); cambian JR-02, JR-03, JR-04, JR-20, JR-21, JR-31, JR-41, «API» y «Fuera de alcance» de `requisitos/jira.md`
- No cambia la lista de destinos autorizados (principio 4) ni JR-24: la lista de campos es un `GET`

## Contexto

El usuario quiere que las tarjetas de «Tableros Jira» digan quién pidió el ticket y cuándo se creó y se actualizó, en este orden:

```
TICKET   Estado [+]
Nombre del ticket
Cliente Portal (la persona que pide el ticket)
Fecha de creación
Fecha de actualización
Prioridad
Persona asignada   (iniciales)
```

«Cliente Portal» es un campo personalizado de su Jira, descrito como «Store customer from JSD linked issue - plugin createLinkedIssue». No es el informador: en los tickets que llegan del portal de Jira Service Desk, el informador es siempre el mismo. Los campos personalizados tienen un identificador `customfield_<cifras>` que cambia de un sitio de Jira a otro, así que la mini app no puede llevarlo en el código.

Preguntas resueltas con el usuario (2026-11-27):

- **Cómo se encuentra el campo**: se elige en «Conexión» entre los campos personalizados de Jira. Se descartó buscarlo por su nombre, que deja de funcionar si alguien lo renombra.
- **Formato de las fechas**: con etiqueta, día y hora: «Creado 12/11/2026 09:30» y «Actualizado 25/11/2026 17:02».
- **Ticket sin cliente**: la línea no se muestra, como pasa hoy con la prioridad.

## Decisión

Plan del sprint 18, aprobado por el usuario (2026-11-27):

- **`customerField` en la conexión (JR-02).** Es opcional: sin él, la mini app funciona igual que antes y no cuenta como campo pendiente (JR-04). Su formato, `customfield_` y de 1 a 18 cifras, impide que un valor guardado meta otra cosa en la consulta.
- **`GET /fields` con `GET /rest/api/3/field` (JR-08).** Es la lista de campos que no pide permisos de administrador. `/rest/api/3/field/search` daría además la descripción del campo, pero sí los pide. El selector muestra el nombre y el identificador, porque dos campos pueden llamarse igual.
- **El campo se pide con la consulta del tablero (JR-21)** y el servidor lo convierte en texto (JR-28). Así la interfaz no tiene que saber qué tipo de campo es: un texto, una persona, una opción o una lista de ellos.
- **Las fechas se muestran en la tarjeta con su etiqueta (JR-41)**, como `DD/MM/AAAA HH:MM` en la hora local. El servidor ya las daba (JR-20).
- **El asignado pasa a la última línea** y la prioridad queda encima, en el orden que pidió el usuario.

## Alternativas descartadas

- **Buscar el campo por su nombre** («Cliente Portal»). No hay que configurar nada, pero deja de funcionar en silencio si se renombra el campo.
- **Escribir el identificador a mano** en «Conexión». Obliga a buscarlo en la administración de Jira.
- **Mostrar «Sin cliente»** en los tickets que no lo tienen. El usuario prefirió no mostrar la línea.
- **Fechas relativas** («hace 2 días»). El usuario prefirió el día y la hora.

## Consecuencias

- **Una ruta nueva, `GET /fields`.** Sin migraciones: la conexión es un fichero (JR-01), y un fichero sin `customerField` se lee sin campo del cliente.
- **Las tarjetas son más altas**: hasta siete líneas. Los tickets en caché de antes de este cambio (JR-46) no tienen cliente hasta que se vuelve a consultar el tablero.
- **Quedan fuera**: el cliente en el detalle (JR-71), en el filtro de texto (JR-43) y en los filtros guardados (JR-27), y otros campos personalizados en las tarjetas.
- **Pendiente con el Jira real**: comprobar el tipo del campo «Cliente Portal» y que JR-28 lo convierte en el nombre del cliente.
- **Planificación**: este sprint toma el número 18. Las métricas de flujo y los avisos de cambios, que el usuario ordenó el 2026-11-24 (ADR-0031), pasan a los sprints 19 y 20.
