# ADR-0006: Una base SQLite por mini app

- Estado: aceptada
- Fecha: 2026-11-09
- Requisitos: P-08, P-09, D-01 a D-04, D-07

## Contexto

Las mini apps con datos necesitan persistencia y migraciones. Podían compartir la base del shell o tener cada una la suya.

## Opciones consideradas

1. **Una base compartida** con prefijo de tabla por mini app y una tabla de control de migraciones por mini app. Una sola copia de seguridad, pero una migración rota o un bloqueo de escritura de una mini app afectan a todas, `user_version` deja de servir y el aislamiento depende de la disciplina de nombres.
2. **Una base por mini app** (elegida).

## Decisión

- Cada mini app con migraciones tiene `<datos>/apps/<id>/data.db`, abierta por la plataforma con `Store` y las reglas D-01, D-02, D-03 y D-07. Sus migraciones están en `db/apps/<id>/` y la plataforma rechaza cualquier otra ruta (P-08).
- La base del shell (`cajonsastre.db`) solo guarda estado de interfaz: `setting` y `app_state` (D-04). El estado de interfaz de las mini apps va allí, y no en su base, para que también lo tengan las mini apps sin servidor.
- La copia previa a cada migración lleva el identificador de la base (`<id>-AAAAMMDD-HHmmss-premigracion.db`, `cajonsastre-…` para el shell) y se conservan 2 de cada una.

## Consecuencias

- Una mini app se puede copiar, restaurar o reiniciar moviendo un fichero.
- No hay transacciones ni claves ajenas entre mini apps: si alguna vez dos necesitan compartir datos, se hará con un contrato explícito y su ADR.
- Las copias diarias, la exportación y la importación de las bases de las mini apps quedan para un sprint posterior.
