-- Prueba: migración que falla a mitad
INSERT INTO t (name) VALUES ('c');
INSERT INTO tabla_que_no_existe (x) VALUES (1);
