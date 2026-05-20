#!/bin/sh
# autorun.sh — Active le serveur RTSP sur caméra Ingenic T30 / Bilian
#
# UTILISATION :
#   1. Formater une carte microSD en FAT32
#   2. Copier CE fichier à la racine de la carte (pas dans un sous-dossier)
#   3. Insérer la carte dans la caméra (slot sous le dôme)
#   4. Redémarrer la caméra (débrancher/rebrancher le câble)
#   5. Attendre 30 secondes, puis tester :
#      ffplay rtsp://admin:admin@192.168.1.150:554/stream

sleep 10  # attendre le démarrage complet du firmware

LOG=/tmp/autorun.log
echo "[autorun] Démarrage $(date)" >> $LOG

# ── Essai 1 : démarrer le service RTSP natif ───────────────────────────────
for bin in \
  /usr/bin/rtspd \
  /usr/sbin/rtspd \
  /system/bin/rtspd \
  /opt/bin/rtspd \
  /usr/bin/mediamgr \
  /usr/bin/streamd; do
  if [ -x "$bin" ]; then
    echo "[autorun] Démarrage $bin" >> $LOG
    $bin &
    sleep 3
    break
  fi
done

# ── Essai 2 : activer RTSP via fichier de config ───────────────────────────
for conf in \
  /system/etc/app.conf \
  /etc/app.conf \
  /mnt/cfg/app.conf \
  /usr/share/cfg/app.conf; do
  if [ -f "$conf" ]; then
    echo "[autorun] Config trouvée : $conf" >> $LOG
    # Activer RTSP si la clé existe
    sed -i 's/rtsp_enable=0/rtsp_enable=1/' "$conf" 2>/dev/null
    sed -i 's/RTSP_ENABLE=0/RTSP_ENABLE=1/' "$conf" 2>/dev/null
    break
  fi
done

# ── Essai 3 : go2rtc depuis la carte SD ───────────────────────────────────
# (optionnel — copier go2rtc ARM sur la carte SD)
SDCARD=$(ls /mnt/sd* /mnt/mmc* 2>/dev/null | head -1)
if [ -n "$SDCARD" ] && [ -f "$SDCARD/go2rtc" ]; then
  echo "[autorun] Lancement go2rtc depuis SD" >> $LOG
  cp "$SDCARD/go2rtc" /tmp/go2rtc
  chmod +x /tmp/go2rtc
  cat > /tmp/go2rtc.yaml << 'YAML'
streams:
  cam: "ffmpeg:device?video=0#video=h264"
api:
  listen: ":1984"
rtsp:
  listen: ":554"
YAML
  /tmp/go2rtc -config /tmp/go2rtc.yaml >> $LOG 2>&1 &
fi

# ── Diagnostic : lister les processus et ports actifs ─────────────────────
sleep 5
echo "[autorun] Processus actifs :" >> $LOG
ps | grep -E "rtsp|stream|media" >> $LOG 2>/dev/null
echo "[autorun] Ports en écoute :" >> $LOG
netstat -tlnp 2>/dev/null | grep -E "554|8554|1984" >> $LOG

echo "[autorun] Terminé." >> $LOG
