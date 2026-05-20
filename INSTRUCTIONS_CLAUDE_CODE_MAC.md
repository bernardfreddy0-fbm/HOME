# Instructions pour Claude Code — Mac réseau local

Copie-colle ce message dans Claude Code sur le Mac connecté au réseau Freebox.

---

## Message à envoyer à Claude Code

```
Bonjour. Tu vas installer et démarrer un serveur qui récupère le flux vidéo
d'une caméra IP et l'affiche dans un navigateur. Voici tout ce que tu dois faire,
dans l'ordre.

---

## Contexte

- Caméra IP Im Cam à l'adresse : 192.168.1.150
- Identifiants probables : admin / admin (à vérifier)
- Code source à cloner depuis GitHub

---

## Étape 1 — Vérifier les prérequis

Lance ces commandes et dis-moi ce qu'elles renvoient :

    ping -c 4 192.168.1.150
    brew --version
    node --version
    ffmpeg -version

Si brew, node ou ffmpeg sont absents, installe-les :

    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install node ffmpeg

---

## Étape 2 — Scanner la caméra

    nmap -sV 192.168.1.150

Dis-moi exactement quels ports sont ouverts (surtout 554, 80, 8080, 34567).

---

## Étape 3 — Cloner le code

    cd ~
    git clone https://github.com/bernardfreddy0-fbm/HOME.git im-cam
    cd im-cam
    git checkout claude/vigorous-borg-3e7526

---

## Étape 4 — Configurer la caméra

    cp .env.example .env

Ouvre le fichier .env et vérifie que ces valeurs sont correctes :

    CAMERA_IP=192.168.1.150
    CAMERA_USER=admin
    CAMERA_PASS=admin

Si les identifiants admin/admin ne fonctionnent pas, essaie dans l'ordre :
- admin / 12345
- admin / password
- root / root
- admin / (vide)

---

## Étape 5 — Tester le flux RTSP directement

Avant de lancer le serveur, teste si FFmpeg peut se connecter à la caméra :

    ffplay "rtsp://admin:admin@192.168.1.150:554/stream"

Si une fenêtre vidéo s'ouvre → le chemin /stream fonctionne, note-le.
Si ça échoue, essaie les autres chemins :

    ffplay "rtsp://admin:admin@192.168.1.150:554/live/ch0"
    ffplay "rtsp://admin:admin@192.168.1.150:554/live/main"
    ffplay "rtsp://admin:admin@192.168.1.150:554/h264/ch1/main/av_stream"
    ffplay "rtsp://admin:admin@192.168.1.150:554/cam/realmonitor?channel=1&subtype=0"
    ffplay "rtsp://admin:admin@192.168.1.150:554/videoMain"

Appuie sur Q pour fermer ffplay entre chaque essai.
Note l'URL exacte qui fonctionne.

---

## Étape 6 — Si aucune URL RTSP ne fonctionne

La caméra utilise peut-être un protocole propriétaire.
Dans ce cas, analyse le trafic pendant que l'app Im Cam est ouverte sur le téléphone :

    brew install wireshark
    sudo tcpdump -i en0 host 192.168.1.150 -w ~/capture_imcam.pcap

Laisse tourner 30 secondes pendant que tu regardes la caméra dans l'app Im Cam,
puis arrête avec Ctrl+C. Ouvre le fichier dans Wireshark et cherche des URLs
ou des flux dans les paquets. Dis-moi ce que tu trouves.

---

## Étape 7 — Lancer le serveur

Une fois l'URL RTSP trouvée, mets-la dans le .env et lance :

    npm install
    ./start.sh

Le navigateur doit s'ouvrir sur http://localhost:8000 avec le flux en direct.

---

## Étape 8 — Rapporter le résultat

Quand le flux s'affiche (ou si tu bloques), envoie un message à bernard.freddy0@gmail.com
avec :
- L'URL RTSP qui fonctionne
- Une capture d'écran du navigateur avec le flux
- Ou le message d'erreur exact si ça ne fonctionne pas

---

Résumé de ce que j'attends de toi :
1. Vérifier que la caméra répond sur le réseau
2. Trouver le bon chemin RTSP (ou le protocole utilisé)
3. Démarrer le serveur et confirmer que le flux s'affiche dans le navigateur
```
