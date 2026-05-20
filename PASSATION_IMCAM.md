# Dossier de passation — Im Cam sur Mac

**Projet :** Affichage du flux vidéo de la caméra IP Im Cam dans un navigateur  
**Date :** 2026-05-20  
**Destinataire :** Technicien Mac / administrateur du site

---

## Vue d'ensemble

Ce projet installe un petit serveur local sur le Mac qui :

1. Se connecte à la caméra IP (`192.168.1.150`) via le protocole RTSP
2. Convertit le flux vidéo au format HLS (lisible dans tout navigateur)
3. Affiche le flux dans une interface web accessible sur `http://localhost:8000`
4. Peut exposer cette interface sur internet via un tunnel sécurisé (Cloudflare)

```
Caméra Im Cam ──RTSP──▶ FFmpeg (sur le Mac) ──HLS──▶ Navigateur web
192.168.1.150                                          localhost:8000
```

---

## Ce qu'il faut préparer avant d'intervenir

| Élément | Valeur |
|---------|--------|
| IP de la caméra | `192.168.1.150` |
| Identifiants caméra | `admin` / `admin` (à vérifier) |
| Réseau | Freebox — réseau local 192.168.1.x |
| Accès Mac | Compte administrateur |
| Connexion internet | Requise pour l'installation |

---

## Étape 1 — Ouvrir le Terminal

Sur le Mac : `Cmd + Espace` → taper `Terminal` → Entrée

Toutes les commandes ci-dessous se tapent dans ce Terminal.

---

## Étape 2 — Installer Homebrew (gestionnaire de paquets)

Vérifier s'il est déjà installé :

```bash
brew --version
```

Si la commande renvoie une version → **passer à l'étape 3**.

Sinon, installer Homebrew :

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Le script demande le mot de passe administrateur. Suivre les instructions à l'écran.

> Sur Mac Apple Silicon (M1/M2/M3), à la fin de l'installation Homebrew affiche
> deux lignes à copier-coller pour ajouter Homebrew au PATH. **Ne pas les ignorer.**

---

## Étape 3 — Installer Node.js et FFmpeg

```bash
brew install node ffmpeg
```

Durée estimée : 5 à 15 minutes selon la connexion.

Vérification :

```bash
node --version    # doit afficher v18.x ou supérieur
ffmpeg -version   # doit afficher ffmpeg version 6.x ou supérieur
```

---

## Étape 4 — Récupérer le code

```bash
cd ~
git clone https://github.com/bernardfreddy0-fbm/HOME.git im-cam
cd im-cam
git checkout claude/vigorous-borg-3e7526
```

---

## Étape 5 — Configurer la caméra

```bash
cp .env.example .env
open -e .env
```

L'éditeur TextEdit s'ouvre. Vérifier et adapter ces lignes :

```
CAMERA_IP=192.168.1.150
CAMERA_USER=admin
CAMERA_PASS=admin
```

Sauvegarder (`Cmd + S`) et fermer TextEdit.

> Si les identifiants `admin`/`admin` ne fonctionnent pas, essayer :
> `admin`/`12345`, `admin`/`password`, ou consulter l'étiquette sous la caméra.

---

## Étape 6 — Premier lancement

```bash
./start.sh
```

Le navigateur s'ouvre automatiquement sur `http://localhost:8000` après 2 secondes.

**Ce que vous devez voir dans le Terminal :**

```
────────────────────────────────────────
  Im Cam — Lecteur flux caméra IP
────────────────────────────────────────
  Interface : http://localhost:8000
  Arrêter   : Ctrl+C
────────────────────────────────────────

[server] Serveur démarré sur http://localhost:8000
[server] Caméra cible : 192.168.1.150:554
[stream] Connexion à rtsp://admin:*****@192.168.1.150:554/stream
[stream] Flux HLS prêt.
```

**Ce que vous devez voir dans le navigateur :**

- Badge **LIVE** en rouge en haut à gauche
- Image vidéo de la caméra

---

## Étape 7 — Si le flux ne s'affiche pas

### 7a. Vérifier que la caméra est joignable

```bash
ping -c 4 192.168.1.150
```

→ Si aucune réponse : la caméra est éteinte ou sur un autre réseau.  
→ Vérifier que le Mac est bien connecté au Wi-Fi de la Freebox (pas un partage de connexion).

### 7b. Scanner les ports de la caméra

```bash
nmap -sV 192.168.1.150
```

→ Si le port `554` n'apparaît pas : la caméra n'accepte pas RTSP sur ce port.

### 7c. Essayer les autres chemins RTSP

Dans l'interface web (`http://localhost:8000`), cliquer **"Essai suivant"** plusieurs fois.
Le bouton teste automatiquement ces chemins :

| # | Chemin testé |
|---|-------------|
| 1 | `/stream` |
| 2 | `/live/ch0` |
| 3 | `/live/main` |
| 4 | `/h264/ch1/main/av_stream` |
| 5 | `/cam/realmonitor?channel=1&subtype=0` |
| 6 | `/videoMain` |

### 7d. Saisir manuellement l'URL RTSP

Si vous connaissez l'URL exacte (trouvée dans l'app Im Cam / Wireshark) :

1. La coller dans le champ texte en haut de la page
2. Cliquer **Connecter**

---

## Étape 8 — Accès depuis l'extérieur du réseau (optionnel)

### Prérequis

```bash
brew install cloudflared
```

### Lancer avec accès distant

Modifier le `.env` :

```
TUNNEL=cloudflared
AUTH_USER=prenom
AUTH_PASS=motdepasse_solide
```

Puis :

```bash
./start.sh
```

Le Terminal affiche une URL publique de la forme :

```
────────────────────────────────────────────────────────────
  Accès distant : https://xyz-abc-123.trycloudflare.com
  Identifiant   : prenom
  Mot de passe  : motdepasse_solide
────────────────────────────────────────────────────────────
```

Cette URL est accessible depuis n'importe où dans le monde, sur mobile ou ordinateur.

> **Important :** l'URL change à chaque redémarrage du serveur.
> Pour une URL fixe, créer un compte gratuit sur [cloudflare.com](https://www.cloudflare.com)
> et configurer un tunnel nommé.

---

## Étape 9 — Lancer automatiquement au démarrage du Mac (optionnel)

Créer un fichier LaunchAgent :

```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.imcam.stream.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.imcam.stream</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd ~/im-cam && ./start.sh >> ~/im-cam/imcam.log 2>&1</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/imcam-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/imcam-stderr.log</string>
</dict>
</plist>
EOF
```

Activer :

```bash
launchctl load ~/Library/LaunchAgents/com.imcam.stream.plist
```

Vérifier :

```bash
launchctl list | grep imcam
# doit afficher une ligne avec com.imcam.stream
```

Désactiver si besoin :

```bash
launchctl unload ~/Library/LaunchAgents/com.imcam.stream.plist
```

---

## Commandes utiles au quotidien

| Action | Commande |
|--------|----------|
| Démarrer | `cd ~/im-cam && ./start.sh` |
| Arrêter | `Ctrl+C` dans le Terminal |
| Voir les logs | `cat /tmp/imcam-stdout.log` |
| Changer la config | `open -e ~/im-cam/.env` |
| Mettre à jour le code | `cd ~/im-cam && git pull` |
| Ouvrir l'interface | `open http://localhost:8000` |

---

## Structure des fichiers

```
~/im-cam/
├── .env               ← Configuration (identifiants, tunnel…)
├── .env.example       ← Template de configuration
├── server.js          ← Serveur Node.js (FFmpeg + API + HLS)
├── tunnel.js          ← Module tunnel Cloudflare
├── config.js          ← Lecture des variables d'environnement
├── start.sh           ← Script de démarrage
├── package.json       ← Dépendances Node.js
└── public/
    └── index.html     ← Interface web Video.js
```

---

## Dépannage rapide

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| `ERREUR : ffmpeg introuvable` | ffmpeg pas installé | `brew install ffmpeg` |
| `ERREUR : le port 8000 est déjà utilisé` | Autre service sur ce port | `PORT=8001 ./start.sh` |
| Spinner infini dans le navigateur | URL RTSP incorrecte | Cliquer "Essai suivant" |
| `Connection refused` sur l'URL RTSP | Mauvais identifiants | Vérifier `CAMERA_PASS` dans `.env` |
| Page blanche dans le navigateur | Serveur pas démarré | Relancer `./start.sh` |
| Tunnel ne démarre pas | cloudflared absent | `brew install cloudflared` |

---

## Contacts et ressources

| Ressource | Lien |
|-----------|------|
| Code source | `https://github.com/bernardfreddy0-fbm/HOME` (branche `claude/vigorous-borg-3e7526`) |
| Documentation FFmpeg | `https://ffmpeg.org/documentation.html` |
| Cloudflare Tunnel | `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/` |
| Homebrew | `https://brew.sh` |

---

*Document généré le 2026-05-20*
