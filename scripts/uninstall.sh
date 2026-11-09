#!/usr/bin/env bash
# Desinstala Cajón de sastre del usuario actual (C-15). Los datos, ajustes, copias, registro y perfil de Chrome
# se conservan; bórralos a mano si ya no los necesitas.
set -euo pipefail

if [ $# -ne 0 ]; then
  echo "Uso: $0" >&2
  exit 2
fi

OPT="$HOME/.local/opt/cajonsastre"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"

if [ -x "$OPT/bin/cajonsastre" ]; then
  "$OPT/bin/cajonsastre" --stop >/dev/null 2>&1 || true
fi

rm -rf "$OPT"
rm -f "$HOME/.local/bin/cajonsastre" "$DATA_HOME/applications/cajonsastre.desktop" \
  "$DATA_HOME/icons/hicolor/scalable/apps/cajonsastre.svg"

echo "Cajón de sastre desinstalado. Se conservan:"
echo "  datos y copias:              $DATA_HOME/cajonsastre"
echo "  ajustes:                     ${XDG_CONFIG_HOME:-$HOME/.config}/cajonsastre"
echo "  registro y perfil de Chrome: ${XDG_STATE_HOME:-$HOME/.local/state}/cajonsastre"
