-- V003: mensajes entre mini apps (specs/diseno/modelo-datos.md, P-29 a P-32, ADR-0025)

CREATE TABLE app_message (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sender     TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  type       TEXT NOT NULL,
  content    TEXT NOT NULL,
  sent_at    TEXT NOT NULL
);

CREATE INDEX app_message_recipient ON app_message (recipient, id);
