-- V002: filtros guardados de «Tableros Jira» (specs/requisitos/jira.md, «Datos», JR-26)

CREATE TABLE saved_filter (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  definition  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
