#!/usr/bin/env bash
set -e

# ── Vérifications ───────────────────────────────────────────────────────────
command -v ffmpeg >/dev/null 2>&1 || { echo "ERREUR : ffmpeg non trouvé. Installer avec : brew install ffmpeg"; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "ERREUR : Node.js non trouvé. Installer depuis https://nodejs.org"; exit 1; }

# ── Dépendances Node ────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "Installation des dépendances Node.js…"
  npm install
fi

# ── Variables d'environnement (personnalisables) ────────────────────────────
export CAMERA_IP="${CAMERA_IP:-192.168.1.150}"
export CAMERA_RTSP_PORT="${CAMERA_RTSP_PORT:-554}"
export CAMERA_USER="${CAMERA_USER:-admin}"
export CAMERA_PASS="${CAMERA_PASS:-admin}"
export PORT="${PORT:-8000}"
export HLS_DIR="${HLS_DIR:-/tmp/hls-stream}"
export RTSP_TRANSPORT="${RTSP_TRANSPORT:-tcp}"

echo ""
echo "  Caméra    : ${CAMERA_IP}:${CAMERA_RTSP_PORT}"
echo "  Interface : http://localhost:${PORT}"
echo ""

node server.js
