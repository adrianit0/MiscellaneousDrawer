# Requisitos de navegación y lanzador

La ventana tiene tres zonas fijas: barra superior, barra lateral de iconos y escenario. En el escenario está el lanzador («Inicio») o la mini app activa.

```text
┌────────────────────────────────────────────────────────────────────┐
│ [▤] Cajón de sastre › Tareas › Lista            ☆  ×   Ir a… ⌃K  ⚙ │
├────┬───────────────────────────────────────────────────────────────┤
│ ⌂  │                                                               │
│────│                                                               │
│ ▣• │            Lanzador o mini app activa                         │
│ ▣  │                                                               │
│────│                                                               │
│ ▣• │                                                               │
│    │                                                               │
└────┴───────────────────────────────────────────────────────────────┘
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
| N-07 | La barra superior mide 48 px. A la izquierda, el logotipo y «Cajón de sastre», que llevan a Inicio, y la miga de pan: el nombre de la mini app activa y, si la mini app lo indica (P-12), su sección. A la derecha, con una mini app activa, «Fijar» o «Desfijar» (☆/★) y «Cerrar» (×); siempre, «Ir a…» con su atajo y «Ajustes» (⚙). |
| N-08 | El título de la ventana es «<mini app> · Cajón de sastre» con una mini app activa y «Cajón de sastre» en Inicio. |
| N-09 | «Ir a…» (Ctrl+K) abre una paleta con Inicio, Ajustes y todas las mini apps. Filtra mientras se escribe por nombre, descripción y palabras clave, sin distinguir mayúsculas ni acentos; ↑ y ↓ eligen, Intro abre y Esc cierra. |

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
