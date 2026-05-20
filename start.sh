#!/usr/bin/env bash
set -e

# ── Vérifications ───────────────────────────────────────────────────────────
command -v ffmpeg >/dev/null 2>&1 || { echo "ERREUR : ffmpeg non trouvé. Installer avec : brew install ffmpeg"; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "ERREUR : Node.js non trouvé. Installer depuis https://nodejs.org"; exit 1; }

# Vérifier cloudflared si tunnel demandé
if [ "${TUNNEL:-none}" = "cloudflared" ]; then
  command -v cloudflared >/dev/null 2>&1 || {
    echo "ERREUR : cloudflared non trouvé. Installer avec : brew install cloudflared"
    exit 1
  }
fi
if [ "${TUNNEL:-none}" = "ngrok" ]; then
  command -v ngrok >/dev/null 2>&1 || {
    echo "ERREUR : ngrok non trouvé. Installer depuis https://ngrok.com/download"
    exit 1
  }
fi

# ── Dépendances Node ────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "Installation des dépendances Node.js…"
  npm install
fi

# ── Variables d'environnement ───────────────────────────────────────────────
export CAMERA_IP="${CAMERA_IP:-192.168.1.150}"
export CAMERA_RTSP_PORT="${CAMERA_RTSP_PORT:-554}"
export CAMERA_USER="${CAMERA_USER:-admin}"
export CAMERA_PASS="${CAMERA_PASS:-admin}"
export PORT="${PORT:-8000}"
export HLS_DIR="${HLS_DIR:-/tmp/hls-stream}"
export RTSP_TRANSPORT="${RTSP_TRANSPORT:-tcp}"
export TUNNEL="${TUNNEL:-none}"
export AUTH_USER="${AUTH_USER:-}"
export AUTH_PASS="${AUTH_PASS:-}"

# ── Avertissement sécurité ──────────────────────────────────────────────────
if [ "${TUNNEL}" != "none" ] && [ -z "${AUTH_USER}" ]; then
  echo ""
  echo "⚠  ATTENTION : tunnel activé sans authentification."
  echo "   N'importe qui avec l'URL peut accéder à la caméra."
  echo "   Recommandé : AUTH_USER=prenom AUTH_PASS=motdepasse ./start.sh"
  echo ""
fi

echo ""
echo "  Caméra    : ${CAMERA_IP}:${CAMERA_RTSP_PORT}"
echo "  Interface : http://localhost:${PORT}"
if [ "${TUNNEL}" != "none" ]; then
  echo "  Tunnel    : ${TUNNEL} (URL publique affichée au démarrage)"
fi
if [ -n "${AUTH_USER}" ]; then
  echo "  Auth      : ${AUTH_USER} / ${AUTH_PASS}"
fi
echo ""

node server.js
