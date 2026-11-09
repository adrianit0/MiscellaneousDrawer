# Requisitos de datos

El shell guarda sus ajustes en `config.json` y su estado de interfaz en su propia base SQLite. Cada mini app con datos tiene su propia base (P-08). El esquema del shell está en [diseno/modelo-datos.md](../diseno/modelo-datos.md).

| ID | Regla |
|---|---|
| D-01 | Cada conexión SQLite aplica `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL` y `busy_timeout=5000`. |
| D-02 | Migraciones numeradas (`V001__initial.sql`, …), en orden, controladas con `PRAGMA user_version`; cada una en su transacción. Antes de migrar una base ya existente se hace una copia con `VACUUM INTO`; se conservan las 2 últimas de cada base. |
| D-03 | Una base creada por una versión más reciente (con `user_version` mayor que sus migraciones) no se abre. Para el shell, la aplicación no arranca; para una mini app, queda en `failed` (P-07). |
| D-04 | La base del shell tiene dos tablas: `setting`, con el estado de interfaz del shell (fijadas, recientes y última ruta), y `app_state`, con el documento de estado de interfaz de cada mini app (P-14). |
| D-05 | `config.json` guarda los ajustes de «Ajustes» (U-06): `port` (1024 a 65535), `autoShutdownMinutes` (null o 1 a 1440) y `updateRepository` (null o la URL de un repositorio de GitHub, R-11). Sin fichero, o con uno ilegible o fuera de rango, valen los valores por defecto y se avisa en el registro. |
| D-06 | El acceso a SQLite usa mappers de MyBatis con anotaciones; MyBatis no registra los parámetros (S-21). |
| D-07 | Una única conexión de escritura por base, serializada; las lecturas van en paralelo por conexiones de solo lectura. |
