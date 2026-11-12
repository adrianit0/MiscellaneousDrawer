-- V002: notificaciones de las mini apps (specs/diseno/modelo-datos.md, P-22, ADR-0013)

CREATE TABLE notification (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  text       TEXT,
  path       TEXT,
  created_at TEXT NOT NULL
);
