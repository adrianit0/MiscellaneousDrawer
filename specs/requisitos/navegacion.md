# Requisitos de navegación y lanzador

La ventana tiene cuatro zonas fijas: barra superior, barra lateral de iconos, escenario y barra inferior, sobre la que se despliega el panel de consolas. En el escenario está el lanzador («Inicio») o la mini app activa.

```text
┌────────────────────────────────────────────────────────────────────┐
│ [▤] Cajón de sastre › Tareas › Lista         ☆  ×   Ir a… ⌃K  🔔 ⚙ │
├────┬───────────────────────────────────────────────────────────────┤
│ ⌂  │                                                               │
│────│                                                               │
│ ▣• │            Lanzador o mini app activa                         │
│ ▣  │                                                               │
│────│                                                               │
│ ▣• │                                                               │
│    │                                                               │
├────┴───────────────────────────────────────────────────────────────┤
│ ▾ Consolas · 1 en progreso                      Limpiar terminadas │
├───────────────────────┬────────────────────────────────────────────┤
│ Trabajo 2 · Hotfix    │ $ aws s3api head-object …                  │
│ Base de datos  En pr… │ Bloque 3 de 12 descargado                  │
│ Trabajo 1 · Develop   │                                            │
│ Base de datos  Error  │                                            │
└───────────────────────┴────────────────────────────────────────────┘
```

## Rutas

| ID | Requisito |
|---|---|
| N-01 | La navegación usa rutas en el fragmento de la URL: `#/` es Inicio, `#/apps/<id>` una mini app y `#/apps/<id>/<subruta>` una sección suya. Una ruta mal formada lleva a Inicio; la de una mini app que no está en el catálogo, también, con el aviso «La mini app «<id>» no existe». |
| N-02 | «Atrás» y «Adelante» del navegador (Alt+← y Alt+→) recorren la navegación, incluidas las subrutas de las mini apps. |
| N-03 | Al abrir la ventana sin ruta se vuelve a la última ruta visitada, si su mini app sigue en el catálogo; si no, a Inicio. |

## Barra lateral y mini apps abiertas

| ID | Requisito |
|---|---|
| N-04 | La barra lateral muestra, de arriba abajo: Inicio, las mini apps fijadas en su orden, un separador y las mini apps abiertas que no están fijadas, en el orden en que se abrieron. Cada botón lleva el icono y el color de su mini app, su nombre como etiqueta accesible y descripción emergente, y la activa se marca (`aria-current="page"`). Una mini app abierta lleva además un punto. |
| N-05 | Abrir una mini app la monta. Al cambiar a otra, sigue montada y oculta, y conserva su estado y su subruta: al volver, aparece como se dejó. Hay como máximo 5 abiertas: al abrir la sexta se cierra la que lleva más tiempo sin usarse. |
| N-06 | «Cerrar» (× en la barra superior, o Alt+W) desmonta la mini app activa y muestra la abierta usada más recientemente o, si no queda ninguna, Inicio. |

## Barra superior

| ID | Requisito |
|---|---|
| N-07 | La barra superior mide 48 px. A la izquierda, el logotipo y «Cajón de sastre», que llevan a Inicio, y la miga de pan: el nombre de la mini app activa y, si la mini app lo indica (P-12), su sección. A la derecha, con una mini app activa, «Fijar» o «Desfijar» (☆/★) y «Cerrar» (×); siempre, «Ir a…» con su atajo, «Notificaciones» (campana, N-11) y «Ajustes» (⚙). |
| N-08 | El título de la ventana es «<mini app> · Cajón de sastre» con una mini app activa y «Cajón de sastre» en Inicio. |
| N-09 | «Ir a…» (Ctrl+K) abre una paleta con Inicio, Ajustes y todas las mini apps. Filtra mientras se escribe por nombre, descripción y palabras clave, sin distinguir mayúsculas ni acentos; ↑ y ↓ eligen, Intro abre y Esc cierra. |
| N-11 | «Notificaciones» despliega bajo la campana las notificaciones guardadas (P-22), de la más reciente a la más antigua: cada una con el icono, el color y el nombre de su mini app, su título, su texto y su fecha (U-02); las de tipo `error` se distinguen. Sin ninguna: «No hay notificaciones». Esc, un clic fuera o la propia campana lo cierran. Una notificación nueva (P-23) aparece sin recargar. |
| N-12 | La campana muestra cuántas notificaciones hay sin leer, «9+» con más de nueve, y lo dice en su nombre accesible. Están sin leer las que llegaron después de la última vez que se abrió el desplegable; ese punto se guarda (D-04). |
| N-13 | Pulsar una notificación abre su mini app, en la subruta de la notificación si la tiene (P-21), y cierra el desplegable. «Limpiar todo» borra todas las notificaciones (P-22) y no aparece si no hay ninguna. |

## Consolas

| ID | Requisito |
|---|---|
| N-14 | La barra inferior ocupa todo el ancho de la ventana y mide 28 px. Tiene el botón «Consolas», que despliega y recoge el panel de consolas (`aria-expanded`) y dice cuántas hay en progreso: «Consolas · 2 en progreso». Que el panel esté desplegado se guarda (D-04). El panel se despliega bajo la barra, a todo el ancho, y quita ese alto al escenario. |
| N-15 | El panel muestra a la izquierda las consolas (P-27), de la más reciente a la más antigua: cada una con su nombre, el icono, el color y el nombre de su mini app, su estado («En progreso», «Terminado», «Error» o «Cancelado») y su hora de inicio (U-02); la elegida se marca (`aria-current`). A la derecha, la salida de la elegida, de solo lectura y en letra monoespaciada (U-03), que se desplaza sola hasta el final salvo que el usuario haya subido. Al desplegarlo está elegida la más reciente. Sin ninguna: «No hay consolas». Una consola nueva o un cambio de estado (P-28) aparecen sin recargar. Las líneas de la consola elegida se piden cada segundo mientras está en progreso y el panel desplegado; recogido, no se pide nada. |
| N-16 | La altura del panel se cambia arrastrando su borde superior, o con ↑ y ↓ con el foco en él (U-04), entre 120 px y el 70 % del alto de la ventana. Nace con 260 px y la altura elegida se guarda (D-04). |
| N-17 | «Limpiar terminadas» descarta las consolas que no están en progreso (P-27) y no aparece si no hay ninguna. |

## Atajos

| ID | Requisito |
|---|---|
| N-10 | Atajos del shell, que funcionan en toda la ventana, también dentro de un campo de texto: Ctrl+K («Ir a…»), Alt+0 (Inicio), Alt+1 a Alt+9 (la mini app fijada en esa posición), Alt+RePág y Alt+AvPág (elemento anterior y siguiente de la barra lateral, de forma circular), y Alt+W (cerrar la mini app activa). Estos, junto con Alt+← y Alt+→ (N-02), están reservados: ninguna mini app puede usarlos (P-16). Esc cierra la paleta o el diálogo del shell que esté abierto; no está reservado, para que cada mini app pueda usarlo en lo suyo. |

## Lanzador

| ID | Requisito |
|---|---|
| L-01 | Inicio muestra un buscador, que recibe el foco al entrar, y debajo las secciones «Fijadas» (si hay), «Recientes» (si hay) y «Todas», esta agrupada por categoría (P-02) en el orden Datos, Productividad, Utilidades. Dentro de cada grupo, las mini apps van por orden alfabético. |
| L-02 | Cada mini app es una tarjeta con su icono en su color, su nombre y su descripción. Lleva la insignia «En preparación» si es `planned` o «Error» si es `failed`, y un botón ☆/★ para fijarla o desfijarla (`aria-pressed`). |
| L-03 | El buscador filtra por nombre, descripción y palabras clave sin distinguir mayúsculas ni acentos. Con texto, se ocultan las secciones y se muestra «Resultados»; Intro abre el primero. Sin resultados: «Ninguna mini app coincide con «<texto>»». |
| L-04 | Las fijadas van en el orden en que se fijaron. Las recientes son las 6 últimas mini apps distintas que se abrieron, la más reciente primero. Las dos listas se guardan (D-04) y los identificadores que ya no están en el catálogo se ignoran. |
| L-05 | Una mini app en preparación se abre como las demás: su página muestra icono, nombre, descripción y «Esta mini app aún no está disponible. Llegará en una versión próxima.». Se puede fijar y aparece en recientes. |
| L-06 | Una mini app que falló al arrancar muestra «No se pudo arrancar «<nombre>»», el mensaje del error y dónde está el registro (C-09). |
| L-07 | Si no se puede cargar el catálogo, Inicio muestra el error y «Reintentar». |
