#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

echo ""
echo "────────────────────────────────────────"
echo "  Im Cam — Démarrage"
echo "────────────────────────────────────────"

# ── Vérifications ──────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo -e "${RED}ERREUR : ffmpeg introuvable.${NC}"
  echo "  → Installer avec : brew install ffmpeg"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo -e "${RED}ERREUR : node introuvable.${NC}"
  echo "  → Installer avec : brew install node"
  exit 1
fi

# ── .env ───────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}[setup] Fichier .env créé depuis .env.example${NC}"
  echo -e "${YELLOW}[setup] Éditer .env si nécessaire, puis relancer ./start.sh${NC}"
  echo ""
  open -e .env 2>/dev/null || true
  read -p "Appuyer sur Entrée une fois .env configuré..."
fi

# ── npm install ────────────────────────────
if [ ! -d node_modules ]; then
  echo "[setup] Installation des dépendances npm..."
  npm install --silent
  echo -e "${GREEN}[setup] Dépendances installées.${NC}"
fi

# ── Ouvrir le navigateur ───────────────────
PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2 || echo 8000)
PORT=${PORT:-8000}
(sleep 2 && open "http://localhost:${PORT}") &

# ── Lancer le serveur ──────────────────────
echo ""
node server.js
