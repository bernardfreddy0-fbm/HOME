#!/usr/bin/env bash
# autostart/vps-setup.sh — Configuration du VPS OVH pour Im Cam
# À lancer UNE FOIS sur le VPS : bash autostart/vps-setup.sh
#
# Ce script :
#   1. Installe Node.js + les dépendances npm
#   2. Configure Im Cam comme service systemd (démarrage automatique)
#   3. Ouvre les ports nécessaires (ufw)

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_USER="${SUDO_USER:-$USER}"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Im Cam — Setup VPS OVH${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "  Installation Node.js LTS..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}  ✓ Node.js $(node -v)${NC}"

# ── Dépendances npm ───────────────────────────────────────────────────────────
cd "$APP_DIR"
npm install --omit=dev
echo -e "${GREEN}  ✓ npm install OK${NC}"

# ── Lire la config Mac (si elle a été copiée) ─────────────────────────────────
FREEBOX_PORT=3001
if [ -f "$HOME/.config/imcam/config" ]; then
  source "$HOME/.config/imcam/config"
  FREEBOX_PORT="${VPS_REMOTE_PORT:-3001}"
fi

read -p "  Port tunnel Freebox Remote sur ce VPS [${FREEBOX_PORT}] : " p
FREEBOX_PORT="${p:-$FREEBOX_PORT}"

read -p "  Port Im Cam [8002] : " IMCAM_PORT
IMCAM_PORT="${IMCAM_PORT:-8002}"

read -p "  ACCESS_KEY (laisser vide = pas de protection) : " ACCESS_KEY

# ── Fichier d'environnement ───────────────────────────────────────────────────
ENV_FILE="/etc/imcam.env"
cat > "$ENV_FILE" <<ENV
PORT=${IMCAM_PORT}
FREEBOX_REMOTE_URL=http://localhost:${FREEBOX_PORT}
${ACCESS_KEY:+ACCESS_KEY=${ACCESS_KEY}}
ENV
chmod 600 "$ENV_FILE"
echo -e "${GREEN}  ✓ $ENV_FILE créé${NC}"

# ── Service systemd ───────────────────────────────────────────────────────────
NODE_BIN="$(command -v node)"
cat > /etc/systemd/system/imcam.service <<SERVICE
[Unit]
Description=Im Cam — WebRTC Proxy Server
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/cylan-webrtc-server.js
EnvironmentFile=/etc/imcam.env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable imcam
systemctl restart imcam
echo -e "${GREEN}  ✓ Service systemd 'imcam' actif${NC}"

# ── Firewall ufw ──────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  ufw allow "${IMCAM_PORT}/tcp" comment "Im Cam WebRTC" 2>/dev/null || true
  echo -e "${GREEN}  ✓ Port ${IMCAM_PORT} ouvert dans ufw${NC}"
fi

# ── Autoriser le tunnel SSH inverse (GatewayPorts) ───────────────────────────
# Par défaut SSH n'autorise que les liaisons sur 127.0.0.1 (ce qu'on veut)
# Pas besoin de GatewayPorts=yes pour un accès localhost uniquement

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}  ✓ VPS configuré !${NC}"
echo ""
echo "  Vérifie le service :"
echo "    systemctl status imcam"
echo "    journalctl -u imcam -f"
echo ""
echo "  URL Im Cam :  http://$(curl -s ifconfig.me 2>/dev/null || echo '<IP-VPS>'):${IMCAM_PORT}"
echo ""
echo -e "${YELLOW}  → Lance maintenant setup.sh sur le Mac pour activer le tunnel.${NC}"
echo ""
