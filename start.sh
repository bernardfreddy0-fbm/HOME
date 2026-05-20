#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

MODE="${1:-rtsp}"  # rtsp | iphone

echo ""
echo "────────────────────────────────────────"
if [ "$MODE" = "iphone" ]; then
  echo "  Im Cam — Mode iPhone USB"
else
  echo "  Im Cam — Mode RTSP/HLS"
fi
echo "────────────────────────────────────────"
echo "  Usage : ./start.sh          (mode RTSP, caméra IP)"
echo "          ./start.sh iphone   (mode iPhone USB)"
echo "────────────────────────────────────────"

# ── Node requis dans tous les cas ──────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}ERREUR : node introuvable.${NC}"
  echo "  → Installer avec : brew install node"
  exit 1
fi

# ── ffmpeg requis seulement en mode RTSP ───
if [ "$MODE" = "rtsp" ] && ! command -v ffmpeg &>/dev/null; then
  # Vérifier ~/bin/ffmpeg (binaire statique)
  if [ -x "$HOME/bin/ffmpeg" ]; then
    export PATH="$HOME/bin:$PATH"
  else
    echo -e "${RED}ERREUR : ffmpeg introuvable.${NC}"
    echo "  → Installer avec : brew install ffmpeg"
    exit 1
  fi
fi

# ── .env ───────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}[setup] Fichier .env créé depuis .env.example${NC}"
  open -e .env 2>/dev/null || true
  read -p "Appuyer sur Entrée une fois .env configuré..."
fi

# ── npm install ────────────────────────────
if [ ! -d node_modules ]; then
  echo "[setup] Installation des dépendances npm..."
  npm install --silent
  echo -e "${GREEN}[setup] Dépendances installées.${NC}"
fi

# ── Choisir le port et le script ───────────
if [ "$MODE" = "iphone" ]; then
  PORT=8001
  SCRIPT="iphone-stream.js"
  # Vérifier qu'un outil de capture est disponible
  if ! command -v idevicescreenshot &>/dev/null && ! python3 -c "import pymobiledevice3" 2>/dev/null; then
    echo -e "${YELLOW}[avertissement] Aucun outil de capture iPhone détecté.${NC}"
    echo "  → Option 1 : brew install libimobiledevice"
    echo "  → Option 2 : pip3 install pymobiledevice3"
    echo ""
    echo "  Le serveur va démarrer mais il ne pourra pas capturer l'écran"
    echo "  tant qu'un outil n'est pas installé."
    echo ""
  fi
else
  PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
  PORT=${PORT:-8000}
  SCRIPT="server.js"
fi

# ── Ouvrir le navigateur ───────────────────
(sleep 2 && open "http://localhost:${PORT}") &

# ── Lancer ────────────────────────────────
echo ""
PORT=$PORT node $SCRIPT
