# ADR-0034: Icono del tipo en las tarjetas de «Tableros Jira»

- Estado: aceptada (2026-11-27, con la aprobación del plan del usuario, dentro del sprint 18)
- Requisitos: JR-29 y JR-38 (nuevos); cambian JR-05, JR-20, JR-21, JR-24, JR-41, «Datos», «API» y «Fuera de alcance» de `requisitos/jira.md`
- No cambia la lista de destinos autorizados (principio 4): los iconos solo se piden al sitio de Jira configurado, con `GET`

## Contexto

Con el cliente y las fechas en las tarjetas (ADR-0033), el usuario pidió distinguir a simple vista una tarea de un bug, una épica o una historia. Su Jira tiene tipos personalizados, así que la mini app debe leer el tipo de cada ticket y usar el icono que le da Jira. Si no puede conseguirlo, usará uno propio.

Dos cosas impiden enlazar el icono de Jira directamente desde la página:

- La política de contenido de la aplicación solo deja cargar imágenes del propio origen o `data:` (`img-src 'self' data:`, S-12).
- Los iconos de Jira Cloud (`/rest/api/2/universal_avatar/view/type/issuetype/avatar/<id>`) piden autenticación, y la ventana de CajonSastre tiene su propio perfil de Chrome, sin la sesión de Jira del usuario (C-08).

## Decisión

Plan aprobado por el usuario (2026-11-27), añadido al sprint 18:

- **El tipo llega con los tickets (JR-20, JR-21).** La consulta pide además `issuetype`, y cada ticket trae su identificador, su nombre y su nivel en la jerarquía.
- **El servidor descarga el icono (JR-29).** `GET /issue-types/<id>/icon` pide el tipo a Jira, descarga su `iconUrl` con la autenticación de la conexión y responde con la imagen como `data:`, que la página sí puede mostrar. Solo descarga si la URL es del sitio configurado, así que ningún dato sale a otro servidor. Solo admite imágenes de 64 KB como mucho y de cinco tipos MIME, y no sigue redirecciones (JR-05). Un SVG dentro de `<img>` no ejecuta scripts.
- **Caché en la memoria del servidor por tipo.** Hay pocos tipos y sus iconos casi no cambian, así que cada uno se pide a Jira una vez mientras la aplicación está abierta. Tampoco se guarda en disco (ADR-0029).
- **Iconos propios cuando no llega el de Jira (JR-38).** Mientras llega el icono, si Jira no lo da o si la descarga no cumple JR-29, la interfaz dibuja uno según el nivel y el nombre del tipo: épica, subtarea, bug, historia o tarea. Así un tipo personalizado se ve con el icono que le corresponde.
- **El transporte de la mini app aprende a recibir datos binarios**, porque hasta ahora solo recibía texto JSON.

## Alternativas descartadas

- **Enlazar el icono de Jira en un `<img>`.** Lo bloquea la política de contenido y no tendría la sesión de Jira.
- **Ampliar la política de contenido** con el dominio de Atlassian. Afecta a todo el shell y seguiría sin autenticación.
- **Una URL de objeto (`blob:`)** con el icono pedido desde la interfaz. Lo bloquea la misma política, y ampliarla afecta a todo el shell.
- **Solo iconos propios.** No distinguen los tipos personalizados como lo hace Jira, que es lo que pidió el usuario.
- **Guardar los iconos en disco.** No hace falta: se piden una vez por ejecución.

## Consecuencias

- **Una ruta nueva, `GET /issue-types/{id}/icon`.** Sin migraciones.
- **`Transport` tiene un segundo método para las respuestas binarias**, y `FakeJira` lo simula.
- **Quedan fuera**: el icono en el panel de detalle (que ya muestra el nombre del tipo) y filtrar o agrupar por tipo.
- **Pendiente con el Jira real**: comprobar que los iconos se descargan sin redirigir a otro servidor. Si redirigen, se verán los iconos propios.
