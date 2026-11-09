#!/usr/bin/env bash
# Instala Cajón de sastre para el usuario actual, sin sudo (C-11 a C-14, ADR-0009):
#   ~/.local/opt/cajonsastre/                                    aplicación
#   ~/.local/bin/cajonsastre                                     comando
#   ~/.local/share/applications/cajonsastre.desktop              lanzador
#   ~/.local/share/icons/hicolor/scalable/apps/cajonsastre.svg   icono
#
# Uso:
#   scripts/install.sh                   compila el proyecto (JDK 21 y Node.js 24) y lo instala
#   scripts/install.sh cajonsastre.jar   instala un JAR único ya compilado con ./mvnw -Pdist package,
#                                        sin Maven ni Node.js
#
# Con jpackage junto a un Java 21 genera una imagen con runtime propio; si no, ejecuta el JAR con ese Java.
# Los datos, los ajustes y el registro no se tocan.
set -euo pipefail

usage() {
  echo "Uso: $0 [cajonsastre.jar]" >&2
  exit 2
}

JAR=""
case $# in
  0) ;;
  1)
    case "$1" in -*) usage ;; esac
    if [ ! -f "$1" ]; then
      echo "No existe el fichero $1" >&2
      exit 1
    fi
    JAR="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
    ;;
  *) usage ;;
esac
cd "$(dirname "$0")/.."

OPT="$HOME/.local/opt/cajonsastre"
BIN_DIR="$HOME/.local/bin"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APPS="$DATA_HOME/applications"
ICONS="$DATA_HOME/icons/hicolor/scalable/apps"
ICON_SOURCE="frontend/public/cajonsastre-icon.svg"
LAUNCHER_SOURCE="packaging/cajonsastre.desktop"
JAVA_OPTIONS="-Xmx384m -XX:+UseSerialGC"
ALTERNATIVE="También puedes compilar en otro equipo con ./mvnw -Pdist package y ejecutar aquí: $0 cajonsastre.jar"

# Ruta real del primer Java 21 o posterior. Con un argumento, solo vale el que tenga esa herramienta al lado
# (javac para compilar, jpackage para la imagen). No exige que sea el Java por defecto del sistema.
find_java() {
  local tool="${1:-}" candidates=() j version
  if [ -n "${JAVA_HOME:-}" ]; then candidates+=("$JAVA_HOME/bin/java"); fi
  for j in /usr/lib/jvm/*/bin/java; do candidates+=("$j"); done
  if command -v java >/dev/null; then candidates+=("$(command -v java)"); fi
  for j in "${candidates[@]}"; do
    [ -x "$j" ] || continue
    j="$(readlink -f "$j")"
    if [ -n "$tool" ] && [ ! -x "$(dirname "$j")/$tool" ]; then continue; fi
    version="$("$j" -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')"
    if [[ "$version" =~ ^[0-9]+$ ]] && [ "$version" -ge 21 ]; then
      echo "$j"
      return 0
    fi
  done
  return 1
}

for f in "$ICON_SOURCE" "$LAUNCHER_SOURCE"; do
  if [ ! -f "$f" ]; then
    echo "Falta $f: ejecuta el instalador desde una copia completa del proyecto." >&2
    exit 1
  fi
done
if ! JAVA="$(find_java)"; then
  echo "Hace falta Java 21 o posterior: sudo apt install openjdk-21-jdk" >&2
  exit 1
fi

# C-12: sin JAR, se compila el proyecto. Las pruebas son cosa de ./mvnw verify.
if [ -z "$JAR" ]; then
  if ! JDK="$(find_java javac)"; then
    echo "Para compilar hace falta un JDK 21 o posterior: sudo apt install openjdk-21-jdk" >&2
    echo "$ALTERNATIVE" >&2
    exit 1
  fi
  NODE_MAJOR="$(node -v 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\).*/\1/p' || true)"
  if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 24 ] || ! command -v npm >/dev/null; then
    echo "Para compilar la interfaz hace falta Node.js 24 o posterior, con npm." >&2
    echo "$ALTERNATIVE" >&2
    exit 1
  fi
  echo "Compilando Cajón de sastre con $(dirname "$(dirname "$JDK")")…"
  JAVA_HOME="$(dirname "$(dirname "$JDK")")" sh ./mvnw -q -B -Pdist -DskipTests package
  JAR="$(pwd)/target/dist/cajonsastre.jar"
  if [ ! -f "$JAR" ]; then
    echo "La compilación no generó $JAR" >&2
    exit 1
  fi
fi

# La nueva instalación se prepara aparte, junto a la definitiva; la anterior no se toca hasta el final (C-14).
mkdir -p "$(dirname "$OPT")"
WORK=""
trap 'if [ -n "$WORK" ]; then rm -rf "$WORK"; fi' EXIT
WORK="$(mktemp -d "$(dirname "$OPT")/.cajonsastre-install.XXXXXX")"
STAGE="$WORK/cajonsastre"

# C-13: imagen de aplicación con runtime propio si hay jpackage; si no, o si falla, el JAR con el Java encontrado.
if JPACKAGE_JAVA="$(find_java jpackage)"; then
  JPACKAGE="$(dirname "$JPACKAGE_JAVA")/jpackage"
  echo "Generando la imagen de aplicación con $JPACKAGE (puede tardar un minuto)…"
  mkdir "$WORK/input"
  cp "$JAR" "$WORK/input/cajonsastre.jar"
  if "$JPACKAGE" --type app-image --name cajonsastre --input "$WORK/input" --main-jar cajonsastre.jar \
      --main-class dev.cajonsastre.Main --java-options -Xmx384m --java-options -XX:+UseSerialGC \
      --dest "$WORK/image" && [ -x "$WORK/image/cajonsastre/bin/cajonsastre" ]; then
    mv "$WORK/image/cajonsastre" "$STAGE"
  else
    echo "jpackage no pudo generar la imagen." >&2
  fi
fi
if [ ! -d "$STAGE" ]; then
  echo "Se instala el JAR, que se ejecutará con $JAVA."
  mkdir -p "$STAGE/bin" "$STAGE/lib"
  install -m 644 "$JAR" "$STAGE/lib/cajonsastre.jar"
  cat > "$STAGE/bin/cajonsastre" <<EOF
#!/bin/sh
exec "$JAVA" $JAVA_OPTIONS -jar "$OPT/lib/cajonsastre.jar" "\$@"
EOF
  chmod 755 "$STAGE/bin/cajonsastre"
fi

# C-14: con todo preparado, se apaga la instancia en marcha y se sustituye la instalación anterior.
if [ -x "$OPT/bin/cajonsastre" ]; then
  "$OPT/bin/cajonsastre" --stop >/dev/null 2>&1 || true
fi
rm -rf "$OPT"
mv "$STAGE" "$OPT"

# C-11: comando, icono y lanzador.
mkdir -p "$BIN_DIR" "$APPS" "$ICONS"
ln -sfn "$OPT/bin/cajonsastre" "$BIN_DIR/cajonsastre"
install -m 644 "$ICON_SOURCE" "$ICONS/cajonsastre.svg"
sed -e "s|@BIN@|$OPT/bin/cajonsastre|" -e "s|@ICON@|$ICONS/cajonsastre.svg|" "$LAUNCHER_SOURCE" > "$APPS/cajonsastre.desktop"
chmod 644 "$APPS/cajonsastre.desktop"

echo "Cajón de sastre instalado en $OPT"
echo "Ábrelo desde «Mostrar aplicaciones» o con el comando cajonsastre."
if ! command -v google-chrome >/dev/null; then
  echo "Aviso: no se encontró Google Chrome, así que la ventana se abrirá en el navegador por defecto."
fi
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Para usar el comando cajonsastre, abre una sesión nueva o añade $BIN_DIR al PATH." ;;
esac
