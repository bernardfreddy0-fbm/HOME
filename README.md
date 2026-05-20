# Im Cam — Intégration flux caméra IP sur plateforme web

Convertit le flux RTSP d'une caméra Im Cam / My-Scan en flux HLS lisible dans n'importe quel navigateur moderne.

## Architecture

```
Caméra IP (192.168.1.150:554)
    │  RTSP
    ▼
FFmpeg (conversion RTSP → HLS)
    │  segments .ts + cam.m3u8
    ▼
Serveur Express (port 8000)
    │  HTTP
    ▼
Navigateur — Video.js (lecture HLS)
```

## Prérequis

- **Node.js** ≥ 18
- **FFmpeg** (`brew install ffmpeg`)
- Mac connecté au réseau local Freebox (192.168.1.x)

## Démarrage rapide

```bash
# 1. Cloner et installer
git clone <repo>
cd im-cam-stream
npm install

# 2. Lancer (identifiants par défaut : admin/admin)
./start.sh

# 3. Ouvrir le navigateur
open http://localhost:8000
```

## Configuration

Toutes les options sont des variables d'environnement :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `CAMERA_IP` | `192.168.1.150` | IP de la caméra |
| `CAMERA_RTSP_PORT` | `554` | Port RTSP |
| `CAMERA_USER` | `admin` | Identifiant |
| `CAMERA_PASS` | `admin` | Mot de passe |
| `RTSP_URL` | *(auto)* | URL RTSP complète (remplace les champs ci-dessus) |
| `RTSP_TRANSPORT` | `tcp` | `tcp` ou `udp` |
| `PORT` | `8000` | Port du serveur web |
| `HLS_DIR` | `/tmp/hls-stream` | Dossier segments HLS |

Copier `.env.example` en `.env` et adapter, ou passer les variables directement :

```bash
CAMERA_PASS=motdepasse RTSP_URL="rtsp://admin:motdepasse@192.168.1.150:554/live/ch0" ./start.sh
```

## API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/status` | État du flux (ready, hlsUrl, rtspUrl) |
| `POST` | `/api/start` | Démarrer avec `{ rtspUrl: "..." }` |
| `POST` | `/api/probe` | Essayer le prochain chemin RTSP connu |
| `POST` | `/api/stop` | Arrêter FFmpeg |

## Chemins RTSP essayés automatiquement

Si l'URL par défaut ne fonctionne pas, le bouton **Essai suivant** dans l'interface teste ces chemins dans l'ordre :

1. `/stream`
2. `/live/ch0`
3. `/live/main`
4. `/h264/ch1/main/av_stream`
5. `/cam/realmonitor?channel=1&subtype=0`
6. `/videoMain`

## Dépannage

**Pas de flux :**
1. Vérifier que la caméra répond : `ping 192.168.1.150`
2. Tester les ports : `nmap -sV 192.168.1.150`
3. Essayer les chemins via le bouton **Essai suivant**
4. Changer les identifiants dans `.env`

**FFmpeg plante en boucle :**
- Essayer `RTSP_TRANSPORT=udp ./start.sh`
- Vérifier les identifiants caméra

**Latence élevée :**
- Réduire `hls.segmentDuration` à `1` et `hls.listSize` à `2` dans `config.js`
