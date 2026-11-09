# ADR-0008: Catálogo inicial con mini apps en preparación

- Estado: propuesta (pendiente de confirmar por el usuario los nombres y descripciones)
- Fecha: 2026-11-09
- Requisitos: P-02, P-04, L-02, L-05

## Contexto

El Sprint 0 construye solo la base: el lanzador y la navegación. El usuario quiere poder seleccionar desde ella las futuras aplicaciones, y nombró dos: un gestor de bases de datos y un gestor de tareas. Sin ninguna mini app en el catálogo, el lanzador estaría vacío y no se podría recorrer la navegación.

## Decisión

- El manifiesto admite `planned = true`: una mini app en preparación aparece en el lanzador, en la barra lateral, en la paleta y en recientes, y se puede fijar, pero su página solo anuncia que llegará (L-05). No tiene servidor, base ni interfaz propios.
- El catálogo inicial tiene dos, ambas en preparación:

| id | Nombre | Descripción | Icono | Color | Categoría | Palabras clave |
|---|---|---|---|---|---|---|
| `database` | Base de datos | Gestor de bases de datos | `database` | `violet` | `data` | sql, tablas, consultas |
| `tasks` | Tareas | Gestor de tareas | `tasks` | `green` | `productivity` | pendientes, listas, por hacer |

- No se crea ninguna mini app de ejemplo funcional (constitución, principio 2): el contrato se prueba con mini apps de prueba que solo existen en `src/test` y en las pruebas de interfaz.

## Consecuencias

- Al implementar una de ellas se cambia `planned` a `false` y se le dan sus módulos (`diseno/mini-apps.md`, «Añadir una mini app»). Su identificador no cambia, así que se conservan fijadas y recientes.
- La descripción visible es deliberadamente genérica hasta que cada mini app tenga su especificación.
