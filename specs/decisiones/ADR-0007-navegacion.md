# ADR-0007: Navegación por fragmento y mini apps abiertas montadas

- Estado: propuesta (pendiente de confirmar por el usuario el máximo de abiertas y la restauración)
- Fecha: 2026-11-09
- Requisitos: N-01 a N-06, N-10

## Contexto

La navegación tenía que permitir elegir una mini app, moverse dentro de ella, volver atrás y cambiar de una a otra sin perder lo que se estaba haciendo.

## Decisión

### Rutas en el fragmento (`#/apps/<id>/<subruta>`)

- La página inicial solo se sirve en `/`, porque es la que lleva el token (S-12). Con rutas en el fragmento no hace falta que el servidor sirva esa página en cualquier otra ruta, y Vite y el JAR se comportan igual.
- «Atrás» y «Adelante» del navegador funcionan sin código propio (N-02).
- Las mini apps reciben solo su subruta y la cambian con `navigate`, sin conocer la forma completa de la ruta: el shell puede cambiarla sin tocarlas.
- No se añade un enrutador de terceros (constitución, principio 2): `router.ts` analiza y forma las rutas en pocas líneas, con sus pruebas.

### Mini apps abiertas montadas

- Al cambiar de mini app, la anterior se oculta pero sigue montada, como una pestaña: conserva su estado, su desplazamiento y lo que tuviera en curso (N-05). Recibe `active = false` para pausar lo que no haga falta.
- Para acotar la memoria en sesiones largas, hay como máximo **5** abiertas; al abrir la sexta se cierra la que lleva más tiempo sin usarse. Cerrar es explícito con × o Alt+W (N-06).
- Al abrir la ventana se vuelve a la **última ruta** visitada (N-03), como LiteDD restaura sus pestañas. Las demás abiertas no se restauran: se montarán al volver a ellas, para que abrir la ventana no cargue varias mini apps a la vez.

## Consecuencias

- Una mini app debe tolerar estar oculta y ser desmontada en cualquier momento; lo que no se pueda perder se guarda al producirse (`diseno/mini-apps.md`).
- El máximo de 5 es una constante (`MAX_OPEN` en `navStore.ts`); si el usuario prefiere otro número o un ajuste, se cambia aquí primero.
