#!/usr/bin/env bash
set -e

# ── Vérifications outils ────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || {
  echo "ERREUR : Node.js non trouvé."
  echo "  → Installer depuis https://nodejs.org  (ou : brew install node)"
  exit 1
}

command -v ffmpeg >/dev/null 2>&1 || \
  [ -x /opt/homebrew/bin/ffmpeg ] || \
  [ -x /usr/local/bin/ffmpeg ] || {
  echo "ERREUR : ffmpeg non trouvé."
  echo "  → brew install ffmpeg"
  exit 1
}

# ── Premier lancement : créer .env depuis le template ──────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Fichier .env créé depuis .env.example"
  echo "  → Éditer .env pour changer les identifiants si nécessaire"
  echo ""
fi

# ── Dépendances Node ────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "Installation des dépendances Node.js…"
  npm install --silent
  echo "✓ Dépendances installées"
  echo ""
fi

# ── Variables d'environnement (le .env est lu par server.js) ────────────────
# Les variables exportées ici surchargent celles du .env
export PORT="${PORT:-8000}"
export TUNNEL="${TUNNEL:-none}"

# Vérifier cloudflared si tunnel demandé
if [ "${TUNNEL}" = "cloudflared" ]; then
  command -v cloudflared >/dev/null 2>&1 || {
    echo "ERREUR : cloudflared non trouvé."
    echo "  → brew install cloudflared"
    exit 1
  }
fi

if [ "${TUNNEL}" = "ngrok" ]; then
  command -v ngrok >/dev/null 2>&1 || {
    echo "ERREUR : ngrok non trouvé."
    echo "  → https://ngrok.com/download"
    exit 1
  }
fi

# ── Avertissement sécurité ──────────────────────────────────────────────────
AUTH_USER_VAL="${AUTH_USER:-$(grep '^AUTH_USER=' .env 2>/dev/null | cut -d= -f2)}"
if [ "${TUNNEL}" != "none" ] && [ -z "${AUTH_USER_VAL}" ]; then
  echo "⚠  ATTENTION : tunnel activé sans authentification."
  echo "   Ajouter dans .env :  AUTH_USER=prenom  AUTH_PASS=motdepasse"
  echo ""
fi

# ── Infos de démarrage ──────────────────────────────────────────────────────
echo "────────────────────────────────────────"
echo "  Im Cam — Lecteur flux caméra IP"
echo "────────────────────────────────────────"
echo "  Interface : http://localhost:${PORT}"
[ "${TUNNEL}" != "none" ] && echo "  Tunnel    : ${TUNNEL} (URL affichée ci-dessous)"
echo "  Arrêter   : Ctrl+C"
echo "────────────────────────────────────────"
echo ""

# ── Ouvrir le navigateur après démarrage ────────────────────────────────────
(sleep 2 && open "http://localhost:${PORT}" 2>/dev/null) &

node server.js
