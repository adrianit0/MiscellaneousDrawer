import { parseSh } from '../apps/database/shImport';

/** BD-66: lectura de un .sh de configuración. Datos inventados (S-31). */

describe('BD-66 importar de un .sh', () => {
  it('BD-66: lee comillas dobles, simples y sin comillas, con export delante y comentarios detrás', () => {
    const result = parseSh(
      [
        '#!/bin/sh',
        '# --- Parámetros inventados ---',
        'BASE_DIR="/datos/importado"',
        "export S3_PATH='s3://bucket-inventado/prefijo'",
        'CONTAINER_NAME=mysql-importado   # comentario',
        'MYSQL_IMAGE="mysql:9.0" ## -- mysql:8.0',
        '  TZ="Europe/Lisbon"',
        'DATABASE_NAME="demo_"\'importada\'',
      ].join('\n'),
    );
    expect(result.values).toEqual({
      workDir: '/datos/importado',
      s3Path: 's3://bucket-inventado/prefijo',
      containerName: 'mysql-importado',
      mysqlImage: 'mysql:9.0',
      timeZone: 'Europe/Lisbon',
      databaseName: 'demo_importada',
    });
    expect(result.skipped).toEqual([]);
  });

  it('BD-66: cada variable de la tabla rellena su campo', () => {
    const result = parseSh(
      [
        'BASE_DIR="/datos/a"',
        'S3_PATH="s3://bucket-inventado"',
        'DATABASE_PREFIX_FILE_S3="_s3.tar.gz"',
        'DATABASE_PREFIX_FILE_LOCAL="_local.tar.gz"',
        'CONTAINER_NAME="mysql-a"',
        'MYSQL_IMAGE="mysql:9.0"',
        'MYSQL_ROOT_PASSWORD="clave-inventada"',
        'LOCAL_PORT="3308"',
        'MYSQL_PORT="3306"',
        'TZ="Europe/Lisbon"',
        'INITDB_FILE="/datos/sql/inicial.sql"',
        'NAME_FILE="/datos/sql/extra.sql"',
        'DATABASE_NAME="demo"',
        'SQL_FOLDER="/datos/sql/pendientes"',
        'SQL_FOLDER_EXECUTED="/datos/sql/ejecutados"',
      ].join('\n'),
    );
    expect(result.values).toEqual({
      workDir: '/datos/a',
      s3Path: 's3://bucket-inventado',
      s3Suffix: '_s3.tar.gz',
      localSuffix: '_local.tar.gz',
      containerName: 'mysql-a',
      mysqlImage: 'mysql:9.0',
      rootPassword: 'clave-inventada',
      hostPort: '3308',
      containerPort: '3306',
      timeZone: 'Europe/Lisbon',
      initSqlFile: '/datos/sql/inicial.sql',
      secondInitSqlFile: '/datos/sql/extra.sql',
      databaseName: 'demo',
      pendingSqlDir: '/datos/sql/pendientes',
      versionsSqlDir: '/datos/sql/ejecutados',
    });
  });

  it('BD-66: ignora las variables que no están en la tabla, también las credenciales de otros sistemas', () => {
    const result = parseSh(['OTRO_HOST="servidor-inventado"', 'OTRO_PASS="no-debe-leerse"', 'GIT_PASS="tampoco"'].join('\n'));
    expect(result.values).toEqual({});
    expect(result.skipped).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('no-debe-leerse');
  });

  it('BD-66: si una variable se repite, vale la última', () => {
    expect(parseSh('TZ="Europe/Madrid"\nTZ="Europe/Lisbon"').values).toEqual({ timeZone: 'Europe/Lisbon' });
    expect(parseSh('TZ="$OTRA"\nTZ="Europe/Lisbon"')).toEqual({ values: { timeZone: 'Europe/Lisbon' }, skipped: [] });
  });

  it('BD-66: quita la / final de las rutas y de la ruta de S3', () => {
    const result = parseSh(['SQL_FOLDER_EXECUTED="/datos/sql/ejecutados/"', 'S3_PATH="s3://bucket-inventado/prefijo//"', 'BASE_DIR="/"'].join('\n'));
    expect(result.values).toEqual({ versionsSqlDir: '/datos/sql/ejecutados', s3Path: 's3://bucket-inventado/prefijo', workDir: '/' });
  });

  it('BD-66: omite, diciendo por qué, lo vacío, lo que usa variables o comandos, las rutas relativas y los puertos fuera de rango', () => {
    const result = parseSh(
      [
        'BASE_DIR=""',
        'SQL_FOLDER="$BASE_DIR/pendientes"',
        'SQL_FOLDER_EXECUTED=${HOME}/ejecutados',
        'MYSQL_IMAGE=`cat imagen`',
        'TZ="$(cat zona)"',
        'NAME_FILE=~/extra.sql',
        'INITDB_FILE="initdb.sql"',
        'LOCAL_PORT="99999"',
        'MYSQL_PORT="tres"',
        'CONTAINER_NAME="sin cerrar',
      ].join('\n'),
    );
    expect(result.values).toEqual({});
    expect(result.skipped).toEqual([
      { field: 'workDir', variable: 'BASE_DIR', reason: 'está vacío' },
      { field: 'containerName', variable: 'CONTAINER_NAME', reason: 'no se puede leer el valor' },
      { field: 'mysqlImage', variable: 'MYSQL_IMAGE', reason: 'usa variables o comandos' },
      { field: 'hostPort', variable: 'LOCAL_PORT', reason: 'no es un número entre 1 y 65535' },
      { field: 'containerPort', variable: 'MYSQL_PORT', reason: 'no es un número entre 1 y 65535' },
      { field: 'timeZone', variable: 'TZ', reason: 'usa variables o comandos' },
      { field: 'initSqlFile', variable: 'INITDB_FILE', reason: 'no es una ruta absoluta' },
      { field: 'secondInitSqlFile', variable: 'NAME_FILE', reason: 'usa variables o comandos' },
      { field: 'pendingSqlDir', variable: 'SQL_FOLDER', reason: 'usa variables o comandos' },
      { field: 'versionsSqlDir', variable: 'SQL_FOLDER_EXECUTED', reason: 'usa variables o comandos' },
    ]);
  });

  it('BD-66: entre comillas simples o escapado, $ es un carácter más', () => {
    const result = parseSh(["MYSQL_ROOT_PASSWORD='cla$ve'", 'DATABASE_NAME="de\\$mo"'].join('\n'));
    expect(result.values).toEqual({ rootPassword: 'cla$ve', databaseName: 'de$mo' });
  });

  it('BD-66: la contraseña se toma tal cual, con sus espacios', () => {
    expect(parseSh('MYSQL_ROOT_PASSWORD=" clave con espacios "').values).toEqual({ rootPassword: ' clave con espacios ' });
  });

  it('BD-66: admite saltos de línea de Windows y la marca BOM', () => {
    expect(parseSh('﻿TZ="Europe/Lisbon"\r\nDATABASE_NAME=demo\r\n').values).toEqual({ timeZone: 'Europe/Lisbon', databaseName: 'demo' });
  });

  it('BD-66: lo que no es una asignación se ignora', () => {
    const result = parseSh(['echo "TZ=Europe/Lisbon"', 'if [ -z "$TZ" ]; then', '  :', 'fi', 'TZ ="Europe/Madrid"'].join('\n'));
    expect(result).toEqual({ values: {}, skipped: [] });
  });
});
