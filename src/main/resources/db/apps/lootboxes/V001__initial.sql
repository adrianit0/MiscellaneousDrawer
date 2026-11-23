-- V001: esquema inicial de «Lootboxes» (specs/requisitos/lootboxes.md, «Datos»)

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE day_points (
  day    TEXT PRIMARY KEY,
  points REAL NOT NULL,
  chests INTEGER NOT NULL
);

CREATE TABLE chest (
  id         TEXT PRIMARY KEY,
  earned_on  TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  opened_at  TEXT,
  delivered  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (earned_on, seq)
);

CREATE TABLE reward (
  chest_id TEXT NOT NULL REFERENCES chest (id),
  position INTEGER NOT NULL,
  item_id  TEXT NOT NULL,
  PRIMARY KEY (chest_id, position)
);
