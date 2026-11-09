-- Mini app de prueba cuya migración falla
CREATE TABLE item (id INTEGER PRIMARY KEY);
INSERT INTO tabla_que_no_existe (x) VALUES (1);
