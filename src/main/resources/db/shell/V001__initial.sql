-- V001: esquema inicial del shell (specs/diseno/modelo-datos.md, D-04)

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE app_state (
  app_id     TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
