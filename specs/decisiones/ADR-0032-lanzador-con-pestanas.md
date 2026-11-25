# ADR-0032: Lanzador con pestañas

- Estado: aceptada (2026-11-25, con las respuestas del usuario)
- Requisitos: L-01 a L-04 (cambiados); L-08 a L-11 (nuevos); D-04 (las horas de las recientes)

## Contexto

El usuario dijo que Inicio «no es utilizable». Con la aplicación arrancada se ve por qué:

- Cada mini app aparece hasta tres veces: en «Fijadas», en «Recientes» y en «Todas». Con nueve mini apps la página ya no cabe en la ventana y «Todas» queda debajo del pliegue.
- Al pulsar ☆ en «Todas», aparece o crece «Fijadas» arriba y toda la página salta: la tarjeta que se acaba de pulsar se va de debajo del ratón.
- Fuera del buscador, no hay forma de recorrer las tarjetas con el teclado más que con Tab, que pasa también por cada ☆.

El usuario pidió tres pestañas («Favoritos», «Usado recientemente» y «Todas las aplicaciones») y mejorar el resto para que sea más cómodo.

Preguntas resueltas con el usuario (2026-11-25):

1. **¿«Favoritos» es la lista de fijadas, que también decide la barra lateral y Alt+1 a Alt+9?** Sí, y se mantiene el nombre que tenía: la pestaña se llama «Fijadas» y los botones siguen diciendo «Fijar» y «Desfijar». No se crea una segunda lista.
2. **¿Qué pestaña se ve al entrar?** Siempre «Fijadas» o, si no hay ninguna, «Todas las aplicaciones». La pestaña elegida no se guarda.
3. **¿Qué mejoras más?** Las cuatro propuestas: manejo completo con teclado, reordenar las fijadas, más contexto en las tarjetas («Abierta» y cuándo se usó) y que fijar no mueva nada de sitio, con contadores y mensajes para las pestañas vacías.

## Decisión

- **Tres pestañas, una mini app una sola vez en pantalla** (L-01). Siguen el patrón de pestañas de ARIA (`tablist`, `tab`, `tabpanel`) y cada una lleva su contador.
- **El buscador manda sobre las pestañas** (L-03): busca en todas las mini apps, sea cual sea la pestaña, y al vaciarlo vuelve la pestaña que había. El primer resultado lleva la marca «Intro», para que se vea qué abre Intro.
- **Fijar no mueve nada** (L-08): en las pestañas no hay secciones que aparezcan ni desaparezcan. En «Fijadas», una tarjeta desfijada se queda, con ☆, hasta cambiar de pestaña o salir, para poder deshacer el clic.
- **«Abierta» y «Hace N min»** (L-02, L-04): la primera sale de `navStore.open`; la segunda exige guardar la hora de cada reciente, en la clave nueva `shell.recentAt` de `setting` (D-04), un objeto `{ id: milisegundos }`. Se guarda aparte de `shell.recent` para no cambiar el formato de esa clave: una instalación anterior sigue leyendo sus recientes, solo que sin hora hasta que se vuelvan a abrir. Pasadas 24 horas se muestra la fecha (U-02), que es como se escriben las fechas en toda la interfaz.
- **Teclado** (L-10): Ctrl+1 a Ctrl+3 eligen pestaña. Chrome no reserva esos atajos (U-04), y como solo valen en Inicio no chocan con ninguna mini app ni con los atajos del shell (N-10, P-16). Las flechas recorren las tarjetas como una rejilla: ↑ y ↓ buscan la tarjeta más cercana en la fila de arriba o de abajo según su posición en pantalla, de modo que funciona con cualquier número de columnas.
- **Reordenar** (L-11): arrastrando con el ratón, o con Ctrl+← y Ctrl+→ con el foco en la tarjeta. No se usa Alt+← ni Alt+→, que son «Atrás» y «Adelante» (N-02). El orden es el mismo de la barra lateral y de Alt+1 a Alt+9, así que reordenar aquí también los cambia.
- No cambia el servidor: `setting` ya acepta cualquier clave con el formato permitido.

## Consecuencias

- `navStore` gana `recentAt` y `movePinned`, con sus pruebas.
- Las pruebas de L-01 a L-04 cambian porque ya no existen las secciones «Fijadas», «Recientes» y «Todas» a la vez.
- Si en el futuro hay muchas más mini apps, «Todas las aplicaciones» puede necesitar filtros por categoría; hoy, con nueve, la agrupación basta.
