// cylan-webrtc-server.js
// Proxy de signaling WebRTC entre le navigateur et les serveurs Cylan
// Sans l'app Im Cam — connexion directe à la caméra
// Usage : PORT=8002 node cylan-webrtc-server.js

'use strict';

const WebSocket = require('ws');
const http      = require('http');
const express   = require('express');
const path      = require('path');

const PORT       = parseInt(process.env.PORT || '8002', 10);
const CYLAN_IM   = 'wss://fde.jfgou.com:443/im';    // WebRTC signaling
const CYLAN_FAST = 'wss://fde.jfgou.com:443/fast';  // Authentification

// Le serveur Cylan exige un Origin reconnu pour accepter les connexions WebSocket
const WS_OPTS = {
  rejectUnauthorized: false,
  headers: { Origin: 'https://fast.jfgou.com' }
};

// ── Identifiants ─────────────────────────────────────────────────────────────
// sessid : token de session (renouvelé automatiquement à chaque démarrage)
let SESSID       = '0001desabbg17ZYRl32yklhooEGY6cF30A39'; // mis à jour au login
const SECRET     = 'e2a6239f51a23e9a10acb6a020b800df';      // dérivé de l'aes_key serveur
const DEVICE_SN  = '2201240300028294';                       // N° de série caméra
const PERMIT_CODE = 'MAMTBNaTT1PC';                         // code d'accès caméra

// Identifiants de connexion (pour renouveler le sessid)
const ACCOUNT    = 'bernard.freddy0@gmail.com';
const PASSWD_MD5 = '0f7c3b3c2462ff22f2854aea59aecbbc'; // MD5 du mot de passe
const VKEY       = 'DcWP670PNfCtPIETQk03lEzbt6qRDRDy';
const UDID       = '37D52478-3F85-4493-BC7E-BC772124783C';

let _reqCounter = 1;
function reqId() { return `node_${Date.now()}_${_reqCounter++}`; }

// ── Connexion au serveur Fast (login) ────────────────────────────────────────
function loginToFast() {
  return new Promise((resolve, reject) => {
    console.log('[login] connexion à', CYLAN_FAST);
    const ws = new WebSocket(CYLAN_FAST, WS_OPTS);
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('login timeout')); }, 12000);

    ws.on('open', () => {
      const msg = JSON.stringify({
        headers: {
          id: 'cli_login',
          req_id: reqId(),
          time: Math.floor(Date.now() / 1000)
        },
        body: {
          os: 0, sys_version: '26.2', type: 0,
          vkey: VKEY, udid: UDID,
          device_token: '', name: '', sessid: '',
          net: 5, account: ACCOUNT,
          bundle_id: 'com.cylan.chatcam', version: '2.33.3',
          model: 'iPad Pro 12.9 inch 3nd gen',
          screen_size: '375*667', language_type: 6,
          passwd: PASSWD_MD5, vid: '0001', simple_passwd: true
        }
      });
      ws.send(msg);
    });

    ws.on('message', (data) => {
      try {
        const arr = JSON.parse(data.toString());
        // Le serveur envoie un tableau JSON
        const msgs = Array.isArray(arr) ? arr : [arr];
        for (const msg of msgs) {
          if (msg.headers?.id === 'cli_login_rsp') {
            clearTimeout(timeout);
            ws.close();
            if (msg.ret === 0) {
              console.log('[login] succès, sessid:', msg.body.sessid);
              resolve(msg.body.sessid);
            } else {
              reject(new Error(`Login échoué: ${msg.msg}`));
            }
            return;
          }
        }
      } catch (e) { /* ignorer messages malformés */ }
    });

    ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

// ── Serveur Express ───────────────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, 'public', 'cylan.html')));
app.get('/api/status', (_req, res) => res.json({ ok: true, device: DEVICE_SN, port: PORT }));

const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

// ── Connexion navigateur ──────────────────────────────────────────────────────
wss.on('connection', (browser) => {
  console.log('[browser] connecté');
  let cylan   = null;
  let sid     = null;
  let ready   = false;

  function toBrowser(obj) {
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify(obj));
    }
  }

  // ── Connexion au serveur de signaling Cylan ────────────────────────────────
  async function connectCylan() {
    // Renouveler le sessid au démarrage
    try {
      SESSID = await loginToFast();
    } catch (e) {
      console.warn('[login] impossible, utilisation du sessid en cache:', e.message);
    }

    console.log('[cylan] connexion à', CYLAN_IM);
    cylan = new WebSocket(CYLAN_IM, WS_OPTS);

    cylan.on('open', () => {
      console.log('[cylan] connecté — envoi signin');
      cylan.send(JSON.stringify({
        secret:     SECRET,
        opcode:     'signin',
        serialCode: SESSID,
        reUseSid:   0,
        key:        'cylanWebRtc',
        reqId:      reqId(),
        loginType:  0
      }));
    });

    cylan.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.opcode === 'signin') {
          if (msg.code === 0) {
            sid   = msg.sid;
            ready = true;
            const iceServers = buildIceServers(msg);
            console.log('[cylan] signin OK, sid:', sid, '— ICE servers:', iceServers.length);
            toBrowser({ type: 'ready', iceServers });
          } else {
            console.error('[cylan] signin refusé code:', msg.code);
            toBrowser({ type: 'error', message: `Signin refusé (code ${msg.code})` });
          }

        } else if (msg.opcode === 'message') {
          let inner = {};
          try { inner = JSON.parse(msg.message || '{}'); } catch {}

          if (msg.messageType === 'callResponse') {
            // Réponse SDP de la caméra
            console.log('[cylan] answer reçu depuis caméra');
            toBrowser({ type: 'answer', sdp: inner.sdp });

          } else if (msg.messageType === 'remoteCandidate') {
            // Candidat ICE de la caméra
            toBrowser({
              type:          'candidate',
              candidate:     inner.candidate,
              sdpMid:        inner.sdpMid,
              sdpMLineIndex: inner.sdpMLineIndex
            });

          } else if (msg.messageType === 'switchVideo') {
            console.log('[cylan] switchVideo reçu (vidéo active)');
            toBrowser({ type: 'switchVideo' });

          } else if (msg.messageType === 'hangup') {
            console.log('[cylan] hangup reçu');
            toBrowser({ type: 'hangup' });
          }

        } else if (msg.opcode === 'heartbeat') {
          // Ping/pong keepalive
          cylan.send(JSON.stringify({ opcode: 'heartbeat' }));
        }
      } catch (e) {
        console.error('[cylan] erreur parsing:', e.message);
      }
    });

    cylan.on('close', (code, reason) => {
      console.log('[cylan] déconnecté:', code, reason.toString());
      ready = false;
      toBrowser({ type: 'error', message: 'Serveur Cylan déconnecté' });
    });

    cylan.on('error', (e) => {
      console.error('[cylan] erreur:', e.message);
      toBrowser({ type: 'error', message: `Erreur Cylan: ${e.message}` });
    });
  }

  // ── Messages reçus du navigateur ──────────────────────────────────────────
  browser.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'connect') {
        // Initialiser la connexion Cylan
        await connectCylan().catch(e => {
          console.error('[browser] erreur connectCylan:', e.message);
          toBrowser({ type: 'error', message: e.message });
        });

      } else if (msg.type === 'offer') {
        if (!ready || !cylan || cylan.readyState !== WebSocket.OPEN) {
          toBrowser({ type: 'error', message: 'Pas encore connecté à Cylan' });
          return;
        }
        console.log('[browser] envoi offer → caméra');
        cylan.send(JSON.stringify({
          opcode:        'message',
          videoCodecType: 0,
          callType:       0,
          volume:         0,
          toSerialCode:   DEVICE_SN,
          permitCode:     PERMIT_CODE,
          message:        JSON.stringify({ type: 'offer', sdp: msg.sdp }),
          sid:            sid,
          messageType:    'callRequest',
          reqId:          reqId()
        }));

      } else if (msg.type === 'candidate') {
        if (!ready || !cylan || cylan.readyState !== WebSocket.OPEN) return;
        cylan.send(JSON.stringify({
          opcode:       'message',
          toSerialCode: DEVICE_SN,
          permitCode:   PERMIT_CODE,
          message:      JSON.stringify({
            candidate:     msg.candidate,
            type:          'candidate',
            sdpMLineIndex: msg.sdpMLineIndex,
            sdpMid:        msg.sdpMid
          }),
          sid:         sid,
          messageType: 'remoteCandidate',
          reqId:       reqId()
        }));

      } else if (msg.type === 'hangup') {
        if (cylan && cylan.readyState === WebSocket.OPEN && sid) {
          cylan.send(JSON.stringify({
            opcode:       'message',
            toSerialCode: DEVICE_SN,
            permitCode:   PERMIT_CODE,
            message:      '',
            sid:          sid,
            messageType:  'hangup',
            reqId:        reqId()
          }));
        }
      }
    } catch (e) {
      console.error('[browser] erreur message:', e.message);
    }
  });

  browser.on('close', () => {
    console.log('[browser] déconnecté');
    if (cylan) {
      if (cylan.readyState === WebSocket.OPEN && sid) {
        // Raccrocher proprement
        try {
          cylan.send(JSON.stringify({
            opcode:       'message',
            toSerialCode: DEVICE_SN,
            permitCode:   PERMIT_CODE,
            message:      '',
            sid:          sid,
            messageType:  'hangup',
            reqId:        reqId()
          }));
        } catch {}
      }
      cylan.close();
    }
  });

  browser.on('error', (e) => {
    console.error('[browser] erreur WS:', e.message);
  });
});

// ── Construire la liste des ICE servers ──────────────────────────────────────
function buildIceServers(signinMsg) {
  const servers = [];
  if (signinMsg.turnAddr) {
    signinMsg.turnAddr.forEach((url, i) => {
      servers.push({
        urls:       url,
        username:   signinMsg.turnUser?.[i] || 'ade1',
        credential: signinMsg.turnPass?.[i] || 'eXuvLVA'
      });
    });
  }
  if (signinMsg.stunAddr?.length) {
    servers.push({ urls: signinMsg.stunAddr });
  }
  return servers;
}

// ── Démarrage ────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log('────────────────────────────────────────────');
  console.log('  Im Cam — Flux WebRTC Direct (sans app)');
  console.log('────────────────────────────────────────────');
  console.log(`  Ouvrir    : http://localhost:${PORT}`);
  console.log(`  Signaling : ${CYLAN_IM}`);
  console.log(`  Caméra    : ${DEVICE_SN}`);
  console.log('  Arrêter   : Ctrl+C');
  console.log('────────────────────────────────────────────');
});
