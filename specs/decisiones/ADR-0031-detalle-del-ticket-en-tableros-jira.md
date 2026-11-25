# ADR-0031: Detalle del ticket en «Tableros Jira»

- Estado: aceptada (2026-11-24, con las respuestas del usuario y la aprobación del plan del sprint 17)
- Requisitos: JR-60 a JR-64 y JR-70 a JR-75 (nuevos); cambian JR-41, «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`
- No cambia la lista de destinos autorizados (principio 4) ni JR-24: el detalle solo usa `GET`

## Contexto

Tras la migración a Jira Cloud, el usuario tiene token de API y usa «Tableros Jira» a diario (ADR-0027 a ADR-0030). Para leer un ticket hoy hay que salir a Jira en el navegador. En la lluvia de ideas del 2026-11-24 el usuario ordenó por necesidad tres mejoras: el detalle del ticket (este ADR, sprint 17), las métricas de flujo (sprint 18) y los avisos de cambios (sprint 19). Los avisos llevarán al detalle, así que este va primero.

Preguntas resueltas con el usuario (2026-11-24):

- **Qué se muestra**: lo pedido (descripción, comentarios, subtareas, enlaces y adjuntos) y, además, el tipo y el informador, el padre o épica, y las etiquetas y los componentes.
- **Adjuntos**: una lista con su nombre, tipo, tamaño y autor que enlaza a Jira, en el Chrome habitual, donde el usuario ya tiene sesión. El servidor no descarga ningún fichero.

## Decisión

Plan del sprint 17, aprobado por el usuario (2026-11-24):

- **Una ruta nueva, `GET /issues/<clave>` (JR-60).** Hace dos llamadas `GET` a Jira: el ticket, con solo los campos que se muestran, y sus comentarios, paginados (JR-62). Devuelve un objeto propio, no el de Jira (JR-61), salvo la descripción y el cuerpo de los comentarios, que van en ADF tal como los da Jira.
- **La clave se valida antes de llamar a Jira (JR-63)**, como las claves de proyecto (JR-12): así ningún valor arma una ruta distinta.
- **ADF pintado por la interfaz, sin HTML (JR-74).** Jira da la descripción y los comentarios en Atlassian Document Format (JSON). La interfaz pinta con React los nodos habituales; React escapa el texto, así que nada de lo que hay en un ticket se interpreta como HTML. Un nodo desconocido muestra el texto que contiene.
- **Comentarios: los 200 más recientes, del más reciente al más antiguo**, que es el orden por defecto de Jira Cloud. Si hay más, se dice.
- **Panel lateral con subruta propia (JR-70).** Al pulsar una tarjeta, el detalle se abre a la derecha, sobre el tablero, y la mini app pasa a `/ticket/<clave>` con entrada en el historial. Así «Atrás» vuelve al ticket anterior cuando se navega por subtareas o enlaces, y en el sprint 19 una notificación podrá abrir el ticket con su subruta (P-21). La clave de la tarjeta sigue abriendo Jira y el botón de Gestask no cambia.
- **Color del estado por su categoría (JR-71).** El detalle no depende de un tablero (puede llegar desde una notificación), así que el estado toma el color de su categoría de Jira, como los estados nuevos del editor (JR-33).
- **Adjuntos enlazados a `<sitio>/rest/api/3/attachment/content/<id>` (JR-73)**, que el navegador abre con la sesión del usuario en Jira. La URL la arma la interfaz con el sitio configurado y el identificador numérico del adjunto, no con la que da Jira.
- **Caché en memoria por ticket (JR-75)**, como la de los tableros (JR-46). Para no enseñar un detalle viejo, se vuelve a consultar cuando el tablero muestra el ticket con otra fecha de actualización.

## Alternativas descartadas

- **`expand=renderedFields`** (el HTML que genera Jira). Ahorraría el renderizador, pero habría que insertar HTML de Jira en la página, con el riesgo de XSS. Sanearlo pide una dependencia nueva, como DOMPurify (principio 2).
- **Descargar los adjuntos en el servidor** para ver las imágenes en miniatura. El usuario eligió la lista enlazada: no hace falta guardar ficheros ni proxy.
- **Un diálogo modal o una sección aparte** en lugar del panel. El panel deja ver el tablero, y la subruta da historial y entrada desde fuera.
- **Una pila propia de «Atrás» dentro del panel.** El historial del shell (N-02) ya lo hace.
- **Guardar el detalle en disco.** JR-46 y ADR-0029 ya decidieron no guardar tickets.

## Consecuencias

- **Una ruta nueva, `GET /issues/{key}`.** Sin migraciones: no se guarda nada.
- **«Fuera de alcance» cambia**: sale el detalle y quedan fuera:
  - los puntos y los campos personalizados;
  - el historial de cambios y el registro de trabajo (el historial llega con las métricas del sprint 18);
  - los enlaces web (remote links);
  - previsualizar o descargar adjuntos;
  - editar nada desde el detalle.
- **Pendiente con el Jira real**: comprobar que el enlace de los adjuntos se abre con la sesión del navegador, y que la descripción de los tickets reales usa los nodos ADF de la tabla de JR-74.
