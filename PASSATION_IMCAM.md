# Passation — Intégration caméra Im Cam sur plateforme web

**Date :** 2026-05-20  
**Objectif :** Récupérer le flux vidéo de la caméra IP et l'afficher sur une plateforme web  
**À réaliser sur :** Mac connecté au réseau local Freebox (192.168.1.x)

---

## Informations de la caméra

| Élément | Valeur |
|--------|--------|
| IP locale | `192.168.1.150` |
| Numéro de série | `2201240300028294` |
| Adresse MAC | `C8:FE:0F:35:24:6D` |
| Application | Im Cam / My-Scan |
| Réseau | Freebox — réseau local |

---

## Prérequis sur le Mac

Ouvrir le Terminal et installer les outils nécessaires :

```bash
# Installer Homebrew si pas déjà fait
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Installer les outils
brew install nmap ffmpeg
```

---

## Étape 1 — Vérifier que la caméra est accessible

```bash
ping -c 4 192.168.1.150
```

Résultat attendu : réponses sans perte de paquets.

---

## Étape 2 — Scanner les ports de la caméra

```bash
nmap -sV 192.168.1.150
```

**Noter les ports ouverts** et les noter ici pour la suite :

| Port | Statut | Service détecté |
|------|--------|----------------|
| 554  | ?      | RTSP           |
| 80   | ?      | HTTP (interface web) |
| 8080 | ?      | HTTP alternatif |
| 8554 | ?      | RTSP alternatif |
| 34567| ?      | Protocole propriétaire |

---

## Étape 3 — Tester l'interface web de la caméra

Ouvrir dans Safari ou Chrome :

```
http://192.168.1.150
http://192.168.1.150:8080
```

Si une page s'affiche → noter identifiants demandés (essayer `admin` / `admin` ou `admin` / vide)

---

## Étape 4 — Tester le flux RTSP

Installer VLC : https://www.videolan.org/vlc/

Puis dans VLC → Fichier → Ouvrir un flux réseau, tester ces URLs une par une :

```
rtsp://admin:admin@192.168.1.150:554/stream
rtsp://admin:admin@192.168.1.150:554/live/ch0
rtsp://admin:admin@192.168.1.150:554/live/main
rtsp://admin:admin@192.168.1.150:554/h264/ch1/main/av_stream
rtsp://admin:@192.168.1.150:554/stream
rtsp://192.168.1.150:554/stream
```

Ou via le Terminal avec ffplay :

```bash
ffplay "rtsp://admin:admin@192.168.1.150:554/stream"
```

**Noter l'URL qui fonctionne.**

---

## Étape 5 — Analyser le trafic réseau (si RTSP non trouvé)

Si aucune URL RTSP ne fonctionne, analyser le trafic pendant que l'app Im Cam est ouverte :

```bash
# Installer Wireshark
brew install --cask wireshark

# Ou capturer en ligne de commande
sudo tcpdump -i en0 host 192.168.1.150 -w capture_imcam.pcap
```

Ouvrir ensuite `capture_imcam.pcap` dans Wireshark et filtrer :
```
ip.addr == 192.168.1.150
```

Chercher des URLs ou protocoles dans les paquets.

---

## Étape 6 — Lancer le flux HLS pour la plateforme web

Une fois l'URL RTSP identifiée, lancer FFmpeg pour convertir en HLS :

```bash
# Créer le dossier de sortie
mkdir -p ~/stream

# Lancer FFmpeg (remplacer l'URL RTSP par celle trouvée à l'étape 4)
ffmpeg -i "rtsp://admin:admin@192.168.1.150:554/stream" \
  -c:v copy \
  -f hls \
  -hls_time 2 \
  -hls_list_size 3 \
  -hls_flags delete_segments \
  ~/stream/cam.m3u8
```

Laisser FFmpeg tourner en arrière-plan.

---

## Étape 7 — Tester l'affichage HTML

Créer un fichier `test_cam.html` sur le bureau :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Test Caméra Im Cam</title>
  <link href="https://vjs.zencdn.net/8.0.4/video-js.css" rel="stylesheet">
  <style>
    body { background: #111; display: flex; justify-content: center; 
           align-items: center; height: 100vh; margin: 0; }
  </style>
</head>
<body>
  <video id="cam" class="video-js vjs-default-skin vjs-big-play-centered"
         controls autoplay muted width="854" height="480" data-setup='{"liveui":true}'>
    <source src="cam.m3u8" type="application/x-mpegURL">
    <p>Votre navigateur ne supporte pas la lecture vidéo.</p>
  </video>

  <script src="https://vjs.zencdn.net/8.0.4/video.min.js"></script>
  <script>
    const player = videojs('cam');
    // Rechargement automatique toutes les 10 secondes si flux coupé
    setInterval(() => {
      if (player.paused()) player.play();
    }, 10000);
  </script>
</body>
</html>
```

Ouvrir un serveur local pour tester :

```bash
cd ~/stream
python3 -m http.server 8000
```

Puis ouvrir dans le navigateur : `http://localhost:8000/test_cam.html`

---

## Résultats à transmettre

Après les tests, remplir ce tableau et partager :

| Étape | Résultat |
|-------|---------|
| Ping caméra | ✅ / ❌ |
| Ports ouverts (nmap) | _(liste)_ |
| Interface web accessible | ✅ / ❌ — URL : |
| URL RTSP qui fonctionne | _(URL)_ |
| Flux HLS généré | ✅ / ❌ |
| Affichage dans navigateur | ✅ / ❌ |

---

## En cas de problème

**Caméra ne répond pas au ping :**
- Vérifier que le Mac est bien sur le réseau 192.168.1.x
- Vérifier que la caméra est allumée et connectée à la Freebox

**Aucune URL RTSP ne fonctionne :**
- Essayer avec différents identifiants : `admin/12345`, `admin/password`, `root/root`
- Passer à l'analyse Wireshark (Étape 5)

**FFmpeg s'arrête :**
- Vérifier les identifiants dans l'URL RTSP
- Essayer d'ajouter `-rtsp_transport tcp` avant le `-i`

```bash
ffmpeg -rtsp_transport tcp -i "rtsp://admin:admin@192.168.1.150:554/stream" ...
```

---

*Document généré le 2026-05-20 — Projet Im Cam → Plateforme web*
