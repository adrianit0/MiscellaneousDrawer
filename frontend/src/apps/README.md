# Mini apps

Una carpeta por mini app, con el mismo nombre que su identificador (P-01): `src/apps/<id>/index.tsx` exporta por
defecto su módulo (P-11). Cada mini app solo importa `src/platform/` y su propia carpeta, y sus estilos van en
`*.module.css` (P-17, P-18); `src/boundaries.test.ts` lo comprueba.

Cómo añadir una: `specs/diseno/mini-apps.md`, «Añadir una mini app».
