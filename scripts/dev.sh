#!/usr/bin/env bash
# Arranca el backend y Vite con recarga en caliente.
# Interfaz: http://127.0.0.1:5174/  ·  API: http://127.0.0.1:47800/api  (C-08: LiteDD usa 5173 y 47600)
set -euo pipefail
cd "$(dirname "$0")/.."

# Token de sesión compartido entre backend y Vite, nuevo en cada arranque (ADR-0003).
CAJONSASTRE_DEV_TOKEN="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
export CAJONSASTRE_DEV_TOKEN

[ -d frontend/node_modules ] || (cd frontend && npm ci)

# Sin ventana propia: la interfaz de desarrollo la sirve Vite.
./mvnw -q -Dskip.frontend compile exec:java -Dexec.mainClass=dev.cajonsastre.Main -Dexec.args=--no-window &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT

cd frontend
npm run dev
