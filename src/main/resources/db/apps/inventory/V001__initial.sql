-- V001: esquema inicial de «Inventario» (specs/requisitos/inventory.md, «Datos»)

CREATE TABLE item (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  rarity   TEXT NOT NULL,
  count    INTEGER NOT NULL,
  first_at TEXT NOT NULL,
  last_at  TEXT NOT NULL
);

CREATE TABLE received_chest (
  chest_id    TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
