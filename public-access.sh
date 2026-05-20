#!/usr/bin/env bash
# public-access.sh — Exposer Im Cam sur internet sans localhost
# Usage: ./public-access.sh [port]
set -e
cd "$(dirname "$0")"

PORT="${1:-8002}"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "────────────────────────────────────────────────"
echo "  Im Cam — Accès public via Cloudflare Tunnel"
echo "────────────────────────────────────────────────"

# Vérifier que le serveur tourne
if ! curl -s "http://localhost:${PORT}/api/status" | grep -q '"ok":true'; then
  echo -e "${YELLOW}[avertissement] Le serveur n'est pas démarré sur le port ${PORT}.${NC}"
  echo "  → Lancer dans un autre terminal : node cylan-webrtc-server.js"
  echo ""
  read -p "  Appuyer sur Entrée une fois le serveur démarré..."
fi

# Chercher cloudflared
CF=""
if command -v cloudflared &>/dev/null; then
  CF="cloudflared"
elif [ -x "$HOME/bin/cloudflared" ]; then
  CF="$HOME/bin/cloudflared"
fi

# Installer cloudflared si absent
if [ -z "$CF" ]; then
  echo "[setup] cloudflared introuvable — téléchargement..."
  mkdir -p "$HOME/bin"
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
  else
    URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
  fi
  curl -sL "$URL" | tar -xz -C "$HOME/bin" cloudflared
  chmod +x "$HOME/bin/cloudflared"
  CF="$HOME/bin/cloudflared"
  echo -e "${GREEN}[setup] cloudflared installé dans ~/bin${NC}"
fi

echo ""
echo -e "${GREEN}  Tunnel démarré — URL publique affichée ci-dessous :${NC}"
echo ""

# Lancer le tunnel (URL unique générée automatiquement)
"$CF" tunnel --url "http://localhost:${PORT}" 2>&1 | while IFS= read -r line; do
  echo "$line"
  # Mettre en évidence l'URL
  if echo "$line" | grep -qE 'https://.*\.trycloudflare\.com'; then
    URL=$(echo "$line" | grep -oE 'https://[^ ]+\.trycloudflare\.com')
    echo ""
    echo -e "${GREEN}  ╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}  ║  URL PUBLIQUE :                          ║${NC}"
    echo -e "${GREEN}  ║  ${URL}  ║${NC}"
    echo -e "${GREEN}  ╚══════════════════════════════════════════╝${NC}"
    echo ""
  fi
done
