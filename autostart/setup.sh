#!/usr/bin/env bash
# autostart/setup.sh — Installe le démarrage automatique au login Mac :
#   1. Freebox Remote (node server.js sur port 3000)
#   2. Tunnel SSH inverse vers le VPS OVH (VPS:3001 → Mac:3000)
#
# Après setup, le VPS peut proxifier /freebox/ via FREEBOX_REMOTE_URL=http://localhost:3001
#
# Usage :  bash autostart/setup.sh

set -e
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

CONF_DIR="$HOME/.config/imcam"
CONF_FILE="$CONF_DIR/config"
AGENTS_DIR="$HOME/Library/LaunchAgents"
FREEBOX_APP="$HOME/Desktop/freebox-remote"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Im Cam — Autostart Freebox Remote + Tunnel SSH${NC}"
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""

# ── Charger config existante ──────────────────────────────────────────────────
mkdir -p "$CONF_DIR"
if [ -f "$CONF_FILE" ]; then
  source "$CONF_FILE"
  echo -e "${GREEN}  Config existante chargée depuis $CONF_FILE${NC}"
fi

# ── Saisie des paramètres VPS ─────────────────────────────────────────────────
echo ""
echo "  Paramètres du VPS OVH (Entrée = garder la valeur existante)"
echo ""

prompt_val() {
  local varname="$1" label="$2" default="$3"
  read -p "  $label [${default:-vide}] : " val
  echo "${varname}=\"${val:-$default}\"" >> "$CONF_FILE.tmp"
  eval "$varname=\"${val:-$default}\""
}

> "$CONF_FILE.tmp"
prompt_val VPS_HOST "IP ou hostname du VPS" "${VPS_HOST:-}"
prompt_val VPS_USER "Utilisateur SSH du VPS" "${VPS_USER:-ubuntu}"
prompt_val VPS_PORT "Port SSH du VPS"        "${VPS_PORT:-22}"
prompt_val VPS_REMOTE_PORT "Port distant sur le VPS (libre)" "${VPS_REMOTE_PORT:-3001}"
prompt_val SSH_KEY  "Chemin clé privée SSH"  "${SSH_KEY:-$HOME/.ssh/id_rsa}"

mv "$CONF_FILE.tmp" "$CONF_FILE"
chmod 600 "$CONF_FILE"
echo ""
echo -e "${GREEN}  Config sauvegardée dans $CONF_FILE${NC}"

# ── Vérifications ─────────────────────────────────────────────────────────────
if [ -z "$VPS_HOST" ]; then
  echo -e "${RED}  Erreur : VPS_HOST est vide. Relance le script et saisis l'IP du VPS.${NC}"
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo ""
  echo -e "${YELLOW}  Clé SSH introuvable : $SSH_KEY${NC}"
  echo "  Génère-la avec :  ssh-keygen -t ed25519 -f \"$SSH_KEY\""
  echo "  Puis copie-la :   ssh-copy-id -i \"$SSH_KEY\" -p $VPS_PORT $VPS_USER@$VPS_HOST"
  exit 1
fi
if [ ! -d "$FREEBOX_APP" ]; then
  echo -e "${RED}  Freebox Remote introuvable dans $FREEBOX_APP${NC}"
  exit 1
fi

# ── Installer autossh si absent ───────────────────────────────────────────────
if ! command -v autossh &>/dev/null; then
  echo ""
  echo "  autossh absent — installation via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo -e "${RED}  Homebrew requis. Installer sur https://brew.sh${NC}"
    exit 1
  fi
  brew install autossh
fi

NODE_BIN="$(command -v node)"
AUTOSSH_BIN="$(command -v autossh)"

# ── Supprimer les anciens agents si présents ──────────────────────────────────
for label in com.imcam.freebox-remote com.imcam.freebox-tunnel; do
  plist="$AGENTS_DIR/${label}.plist"
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    rm "$plist"
  fi
done

# ── Plist 1 : Freebox Remote ──────────────────────────────────────────────────
cat > "$AGENTS_DIR/com.imcam.freebox-remote.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>com.imcam.freebox-remote</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${FREEBOX_APP}/server.js</string>
  </array>
  <key>WorkingDirectory</key>   <string>${FREEBOX_APP}</string>
  <key>RunAtLoad</key>          <true/>
  <key>KeepAlive</key>          <true/>
  <key>StandardOutPath</key>    <string>${CONF_DIR}/freebox-remote.log</string>
  <key>StandardErrorPath</key>  <string>${CONF_DIR}/freebox-remote.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>             <string>3000</string>
    <key>HOME</key>             <string>${HOME}</string>
    <key>PATH</key>             <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>
PLIST

# ── Plist 2 : Tunnel SSH inverse ──────────────────────────────────────────────
cat > "$AGENTS_DIR/com.imcam.freebox-tunnel.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>com.imcam.freebox-tunnel</string>
  <key>ProgramArguments</key>
  <array>
    <string>${AUTOSSH_BIN}</string>
    <string>-M</string>          <string>0</string>
    <string>-N</string>
    <string>-o</string>          <string>ServerAliveInterval=30</string>
    <string>-o</string>          <string>ServerAliveCountMax=3</string>
    <string>-o</string>          <string>ExitOnForwardFailure=yes</string>
    <string>-o</string>          <string>StrictHostKeyChecking=no</string>
    <string>-i</string>          <string>${SSH_KEY}</string>
    <string>-p</string>          <string>${VPS_PORT}</string>
    <string>-R</string>          <string>${VPS_REMOTE_PORT}:localhost:3000</string>
    <string>${VPS_USER}@${VPS_HOST}</string>
  </array>
  <key>RunAtLoad</key>          <true/>
  <key>KeepAlive</key>          <true/>
  <key>StandardOutPath</key>    <string>${CONF_DIR}/freebox-tunnel.log</string>
  <key>StandardErrorPath</key>  <string>${CONF_DIR}/freebox-tunnel.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AUTOSSH_GATETIME</key> <string>0</string>
    <key>HOME</key>             <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST

# ── Charger les agents ────────────────────────────────────────────────────────
launchctl load "$AGENTS_DIR/com.imcam.freebox-remote.plist"
launchctl load "$AGENTS_DIR/com.imcam.freebox-tunnel.plist"

sleep 2

# ── Vérification ─────────────────────────────────────────────────────────────
echo ""
echo "  Vérification des services..."
echo ""

check_service() {
  local label="$1"
  if launchctl list | grep -q "$label"; then
    echo -e "${GREEN}  ✓ $label — actif${NC}"
  else
    echo -e "${RED}  ✗ $label — problème de démarrage${NC}"
  fi
}
check_service "com.imcam.freebox-remote"
check_service "com.imcam.freebox-tunnel"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}  ✓ Autostart installé !${NC}"
echo ""
echo "  Sur le VPS OVH, lance Im Cam avec :"
echo ""
echo -e "${YELLOW}  FREEBOX_REMOTE_URL=http://localhost:${VPS_REMOTE_PORT} node cylan-webrtc-server.js${NC}"
echo ""
echo "  Ou ajoute dans /etc/environment (persistant) :"
echo ""
echo -e "${YELLOW}  FREEBOX_REMOTE_URL=http://localhost:${VPS_REMOTE_PORT}${NC}"
echo ""
echo "  Logs :"
echo "    Freebox Remote  : tail -f $CONF_DIR/freebox-remote.log"
echo "    Tunnel SSH      : tail -f $CONF_DIR/freebox-tunnel.log"
echo ""
