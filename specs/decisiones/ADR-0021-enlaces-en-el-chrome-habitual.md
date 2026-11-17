# ADR-0021: Los enlaces externos se abren en el Chrome habitual

- Estado: aceptada (2026-11-17)
- Requisitos: C-16 (nuevo), ruta `POST /api/open-link` (api.md)
- Modifica: nada; C-03 sigue igual y las mini apps no cambian

## Contexto

La ventana de Cajón de sastre es un Chrome en modo aplicación con un perfil propio en `<estado>/chrome` (C-03, C-08). Un enlace a una página externa, como el ticket o el PR de una tarea de «Gestask», se abría en ese mismo Chrome: una ventana aparte, sin las sesiones, las extensiones ni los marcadores del usuario.

El usuario pidió que todo enlace que se pulse dentro de la aplicación se abra en su Chrome de siempre, no en una versión de Chrome dentro del programa (2026-11-17).

## Decisión

- **Qué enlaces.** Los `<a href>` con una URL `http` o `https` de otro origen. Las rutas de la propia aplicación (`#/…`) y los enlaces a su mismo origen siguen dentro de la ventana; `mailto:` y otros esquemas se dejan al navegador.
- **El shell los intercepta todos.** Un único escuchador de clics en el documento, en fase de captura, para el clic normal, el clic con Ctrl o Mayúsculas y el clic central. Así vale para cualquier mini app sin que tenga que hacer nada ni importar nada nuevo de la plataforma (P-18), y aunque detenga la propagación del clic.
- **La página no puede salir de su Chrome**, así que pide al servidor que lo haga: `POST /api/open-link` con `{"url": …}`. La ruta exige el token y el Origin como cualquier otra (S-12, S-13).
- **El servidor ejecuta `google-chrome <url>`**, sin `--app` ni `--user-data-dir`: Chrome usa el perfil por defecto del usuario y, si ya está abierto, abre una pestaña en su ventana. Si Chrome no está, `xdg-open <url>` (el navegador por defecto). En Windows, solo para desarrollo, el navegador por defecto (ADR-0004).
- **El servidor solo abre enlaces web.** Acepta una URL que empieza por `http://` o `https://`, con host, sin espacios ni caracteres de control y de hasta 8192 caracteres; cualquier otra cosa es 400 `invalid_url` y no ejecuta nada. Sin esta comprobación la ruta abriría ficheros locales o pasaría opciones a Chrome. La URL va como un único argumento, sin shell.
- **Sin las variables del lanzador de jpackage.** El Chrome que se abre no hereda `_JPACKAGE_LAUNCHER` ni `LD_LIBRARY_PATH`, que rompen los comandos del sistema (BD-19).

No añade ningún destino de red (constitución, principio 4): la aplicación no se conecta a nada; el navegador del usuario abre una página que él ha pulsado, como antes, solo que en otra ventana.

## Alternativas descartadas

- **`xdg-open` en primer lugar.** Abre el navegador por defecto, que puede no ser Chrome; el usuario pidió Chrome.
- **Una función `openExternal(url)` en la plataforma** para que cada mini app la llame. Obliga a cambiar cada enlace y se olvida en los nuevos; el escuchador del shell cubre todos los `<a>` sin tocar las mini apps.
- **Quitar el perfil propio de la ventana** para que comparta el Chrome del usuario. Rompe C-08 (convivencia con LiteDD) y la asociación de la ventana a su lanzador (C-03, C-11).

## Consecuencias

- Los enlaces que se abren desde el menú contextual de Chrome («Abrir enlace en una pestaña nueva») no pasan por la página y siguen abriéndose en el Chrome de la ventana.
- Una mini app que quiera un enlace externo usa un `<a href>` normal; no debe usar `window.open`, que no pasa por el escuchador.
