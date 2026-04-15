# SeniorLink — Design Spec
**Date :** 2026-04-15
**Statut :** Approuvé

---

## Résumé

SeniorLink est une application web gratuite permettant à un proche aidant (famille, ami) de prendre en main à distance le PC/Mac et la télévision d'un senior. Le senior n'a aucune compétence technique requise après la configuration initiale, réalisée physiquement par l'aidant.

---

## Contexte et objectif

### Problème
Les seniors rencontrent régulièrement des blocages sur leur ordinateur (ne savent pas installer une appli, cliquent au mauvais endroit) et sur leur télévision (ne savent pas naviguer dans les menus, les vidéos YouTube s'arrêtent et ils ne savent pas reprendre). La solution actuelle — se déplacer physiquement — est contraignante pour la famille.

### Objectif
Permettre à un aidant de résoudre ces situations à distance, en quelques minutes, sans que le senior ait à faire quoi que ce soit.

### Hors scope
- Modèle B2B (maisons de retraite, associations) — version future éventuelle
- Support professionnel payant
- Application mobile native (interface aidant navigateur uniquement pour le MVP)

---

## Modèle

- **Utilisateurs :** aidants proches (fils, fille, ami)
- **Bénéficiaires :** seniors à domicile
- **Modèle économique :** gratuit
- **Installation :** physique une fois par l'aidant, tout remote ensuite

---

## Architecture

### Vue d'ensemble

```
[Aidant — Web App]
        ↕ WebRTC P2P chiffré (DTLS)
[Infrastructure Cloud]
  · Signaling Server (mise en relation WebRTC)
  · Auth Server (appairage aidant/senior)
  · TURN Relay (fallback si NAT strict)
        ↕ WebRTC P2P chiffré
[Senior — Domicile]
  · Agent PC/Mac
  · Boîtier TV (Raspberry Pi)
```

### Principe clé
Le flux vidéo et audio transite en **P2P direct chiffré** entre les deux appareils. Le serveur cloud ne voit jamais le contenu des sessions — uniquement les métadonnées d'appairage.

---

## Composants

### 1. Web App aidant

Interface navigateur (aucune installation). Accessible depuis n'importe quel appareil.

**Tableau de bord :**
- Liste des seniors configurés avec statut en ligne / hors ligne
- Boutons d'accès direct : "PC à distance" et "TV à distance" par senior
- Historique des sessions (date, durée, appareil)
- Gestion de la playlist YouTube Continu par senior

**Session PC :**
- Flux vidéo de l'écran du senior en temps réel
- Contrôle complet souris + clavier
- Bascule instantanée observation ↔ contrôle
- Outil d'annotations superposées (flèches, cercles, texte) visibles côté senior
- Chat vidéo simultané (l'aidant et le senior se voient pendant la session)
- Gestion des applications (installer, mettre à jour, désinstaller)

**Session TV :**
- Flux vidéo de l'écran TV en temps réel (via capture HDMI du boîtier)
- Télécommande virtuelle (navigation, volume, OK, retour, power)
- Commandes rapides : YouTube, BFM TV, Accueil, Sourdine, Paramètres
- Audio bidirectionnel (parler au senior via le micro/HP du boîtier)

---

### 2. Agent PC / Mac

Installé une seule fois physiquement par l'aidant.

- **Plateformes :** Windows + macOS
- **Taille :** < 20 Mo
- **Démarrage :** automatique au boot, aucune interaction du senior
- **Connexion :** silencieuse — la session s'ouvre directement quand l'aidant la lance (la confiance est établie à l'appairage)
- **Indicateur :** icône discrète dans la barre système, change de couleur pendant une session active (informatif, non-bloquant)
- **Mises à jour :** silencieuses et automatiques
- **Protocole :** WebRTC (DTLS chiffré bout en bout)

---

### 3. Boîtier TV (SeniorLink Box)

**Matériel :** Raspberry Pi (ou équivalent)

**Connexions physiques :**
- HDMI IN ← source (box opérateur, Chromecast, Apple TV, console…)
- HDMI OUT → télévision
- IR Blaster (câble ou intégré) pointé vers la TV et/ou la box
- Wi-Fi intégré
- Micro + haut-parleur (communication audio avec le senior)

**Fonctionnement :**
- Capture le signal HDMI de la source et le transmet à la TV sans perte
- Capture simultanée du flux vidéo → envoyé à l'aidant via WebRTC
- Reçoit les commandes IR de l'aidant → les émet vers la TV/box
- Compatible toutes marques TV et toutes sources, indépendamment de leurs APIs propriétaires

**IR Blaster :**
- Simule n'importe quelle télécommande (base de données de codes IR universelle)
- Configuré lors de l'installation physique pour la TV et la box du senior

---

### 4. Mode YouTube Continu

**Problème résolu :** YouTube affiche "Continuer à regarder ?" après une période d'inactivité. Le senior ne sait pas réagir → vidéo bloquée indéfiniment.

**Solution :**
Le boîtier surveille en continu le flux HDMI capturé. Lorsqu'il détecte le signal de pause YouTube (détection visuelle par analyse d'image), il envoie automatiquement le signal IR "OK" vers la TV → la lecture reprend sans aucune intervention du senior.

**Playlist gérée par l'aidant :**
- L'aidant configure depuis le dashboard une liste de vidéos/playlists YouTube pour le senior
- Les vidéos s'enchaînent automatiquement
- Lecture en boucle configurable
- L'aidant peut mettre en pause ou modifier la playlist à distance

**Mécanisme playlist :** Le boîtier navigue dans YouTube via les signaux IR (séquences de navigation dans les menus YouTube TV) pour lancer la vidéo suivante de la liste. L'aidant configure les URLs YouTube dans le dashboard ; le boîtier les traduit en séquences de navigation IR.

**Note d'implémentation :** Le raffinement de la détection d'écran, des séquences IR de navigation et de la gestion de playlist sera développé lors de la phase hardware (disponibilité du Raspberry Pi).

---

### 5. Infrastructure Cloud

**Signaling Server :**
- Gère la mise en relation WebRTC entre aidant et agent/boîtier
- Ne voit pas le contenu des sessions (uniquement les métadonnées d'établissement de connexion)

**Auth Server :**
- Gère les comptes aidants
- Stocke les appairages aidant ↔ senior (PC + boîtier TV)
- Seuls les comptes explicitement appairés peuvent lancer une session

**TURN Relay :**
- Fallback pour les connexions derrière NAT strict
- Garantit la connexion même dans des configurations réseau complexes

---

## Sécurité

| Principe | Implémentation |
|---|---|
| Appairage physique | Lien aidant/senior établi en présence, code unique généré à l'installation |
| Chiffrement bout en bout | WebRTC DTLS — le cloud ne voit jamais le contenu des sessions |
| Accès restreint | Seuls les comptes appairés peuvent lancer une session, pas de lien partageable |
| Données minimales | Seules les métadonnées (durée, date, appareil) sont conservées, jamais le contenu |
| Indicateur côté senior | Icône barre système active pendant session (informatif, non-bloquant) |

---

## Flux utilisateur principal

1. L'aidant ouvre la web app depuis son navigateur
2. Il voit ses proches — statut en ligne / hors ligne
3. Il clique "PC à distance" ou "TV à distance" pour Mamie Jeanne
4. Le signaling server met en relation les deux appareils
5. Un tunnel WebRTC P2P chiffré s'établit en quelques secondes
6. L'aidant voit l'écran du senior en temps réel et prend le contrôle
7. Il guide le senior verbalement via le chat vidéo / audio
8. Il termine la session — la connexion se ferme, l'agent repasse en veille

---

## Phases de développement suggérées

| Phase | Contenu | Prérequis |
|---|---|---|
| Phase 1 | Web app + agent PC Windows | — |
| Phase 2 | Extension agent Mac | Phase 1 |
| Phase 3 | Boîtier TV — capture HDMI + télécommande IR | Raspberry Pi disponible |
| Phase 4 | Mode YouTube Continu (détection écran + playlist) | Phase 3 |
| Phase 5 | Mobile app aidant (optionnel) | Phase 1 |
