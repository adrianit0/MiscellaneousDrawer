# Modelo de datos del shell

La base del shell (`cajonsastre.db`) solo guarda estado de interfaz. Los datos de cada mini app van en su propia base (P-08) y su esquema se documenta en su especificación.

## Esquema

```sql
-- V001 (db/shell/V001__initial.sql)
CREATE TABLE setting (
  key   TEXT PRIMARY KEY,       -- [A-Za-z0-9._-]{1,100}
  value TEXT NOT NULL           -- JSON
);

CREATE TABLE app_state (
  app_id     TEXT PRIMARY KEY,  -- identificador de la mini app (P-01)
  value      TEXT NOT NULL,     -- objeto JSON de hasta 64 KB (P-14)
  updated_at TEXT NOT NULL      -- ISO-8601 UTC
);

-- V002 (db/shell/V002__notifications.sql)
CREATE TABLE notification (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- nunca se reutiliza: N-12 compara con el último visto
  app_id     TEXT NOT NULL,     -- identificador de la mini app (P-01)
  kind       TEXT NOT NULL,     -- info, success o error (P-21)
  title      TEXT NOT NULL,     -- 1 a 80 caracteres
  text       TEXT,              -- hasta 300 caracteres
  path       TEXT,              -- subruta de la mini app
  created_at TEXT NOT NULL      -- ISO-8601 UTC
);
```

`notification` conserva las 50 últimas filas (P-22): las anteriores se borran al insertar.

`app_state` no tiene clave ajena: el catálogo vive en el código, no en la base. Una fila de una mini app que ya no está en el catálogo se conserva, por si vuelve, y no se sirve (A-04).

## Claves de `setting`

| Clave | Valor | Requisito |
|---|---|---|
| `shell.pinned` | Lista de identificadores, en el orden en que se fijaron | L-04 |
| `shell.recent` | Lista de hasta 6 identificadores, el más reciente primero | L-04 |
| `shell.lastRoute` | Última ruta visitada, como `#/apps/tasks/lista` | N-03 |
| `shell.notificationsSeen` | Identificador de la última notificación vista | N-12 |

## `config.json`

```json
{
  "port": 47800,
  "autoShutdownMinutes": null,
  "updateRepository": null,
  "notificationSound": true,
  "desktopNotifications": true
}
```
