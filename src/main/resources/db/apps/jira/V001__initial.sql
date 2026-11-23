-- V001: esquema inicial de «Tableros Jira» (specs/requisitos/jira.md, «Datos»)

CREATE TABLE board (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  definition  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
