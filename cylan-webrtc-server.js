// cylan-webrtc-server.js  v2
// Proxy WebRTC Cylan + reverse proxy Freebox Remote
// Usage : PORT=8002 node cylan-webrtc-server.js

'use strict';

const WebSocket = require('ws');
const http      = require('http');
const express   = require('express');
const path      = require('path');
const crypto    = require('crypto');
const zlib      = require('zlib');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT       = parseInt(process.env.PORT || '8002', 10);
const CYLAN_IM   = 'wss://fde.jfgou.com:443/im';
const CYLAN_FAST = 'wss://fde.jfgou.com:443/fast';

// Le serveur Cylan exige un Origin reconnu
const WS_OPTS = {
  rejectUnauthorized: false,
  headers: { Origin: 'https://fast.jfgou.com' }
};

// ── Identifiants ──────────────────────────────────────────────────────────────
let SESSID        = process.env.CYLAN_SESSID  || '0001desabbg17ZYRl32yklhooEGY6cF30A39';
const SECRET      = process.env.CYLAN_SECRET  || 'e2a6239f51a23e9a10acb6a020b800df';
const DEVICE_SN   = process.env.DEVICE_SN     || '2201240300028294';
const PERMIT_CODE = process.env.PERMIT_CODE   || 'MAMTBNaTT1PC';
const ACCOUNT     = process.env.CYLAN_ACCOUNT || 'bernard.freddy0@gmail.com';
const PASSWD_MD5  = process.env.CYLAN_PASSWD  || '0f7c3b3c2462ff22f2854aea59aecbbc';
const VKEY        = 'DcWP670PNfCtPIETQk03lEzbt6qRDRDy';
const UDID        = '37D52478-3F85-4493-BC7E-BC772124783C';

// Clé API optionnelle pour protéger l'accès public (env ACCESS_KEY)
const ACCESS_KEY = process.env.ACCESS_KEY || null;

let _rc = 1;
function reqId() { return `node_${Date.now()}_${_rc++}`; }

// ── Login ─────────────────────────────────────────────────────────────────────
function loginToFast() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(CYLAN_FAST, WS_OPTS);
    const t  = setTimeout(() => { ws.terminate(); reject(new Error('login timeout')); }, 12000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        headers: { id: 'cli_login', req_id: reqId(), time: Math.floor(Date.now() / 1000) },
        body: {
          os: 0, sys_version: '26.2', type: 0,
          vkey: VKEY, udid: UDID,
          device_token: '', name: '', sessid: '', net: 5,
          account: ACCOUNT,
          bundle_id: 'com.cylan.chatcam', version: '2.33.3',
          model: 'iPad Pro 12.9 inch 3nd gen',
          screen_size: '375*667', language_type: 6,
          passwd: PASSWD_MD5, vid: '0001', simple_passwd: true
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        const arr  = JSON.parse(data.toString());
        const msgs = Array.isArray(arr) ? arr : [arr];
        for (const msg of msgs) {
          if (msg.headers?.id === 'cli_login_rsp') {
            clearTimeout(t); ws.close();
            if (msg.ret === 0) resolve(msg.body.sessid);
            else reject(new Error(`Login échoué: ${msg.msg}`));
            return;
          }
        }
      } catch {}
    });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();

// Middleware clé API optionnelle
app.use((req, res, next) => {
  if (!ACCESS_KEY) return next();
  const k = req.query.key || req.headers['x-access-key'];
  if (k === ACCESS_KEY) return next();
  // Autoriser la page HTML principale sans clé (elle l'enverra ensuite via WS)
  if (req.path === '/' || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js')) return next();
  res.status(401).json({ error: 'Clé API invalide' });
});

// ── Reverse proxy Freebox Remote ─────────────────────────────────────────────
// Freebox Remote (Express ESM) tourne sur http://localhost:3000
// On l'expose sous /freebox/ en injectant un patch fetch pour corriger les chemins absolus

const FREEBOX_REMOTE_URL = process.env.FREEBOX_REMOTE_URL || 'http://localhost:3000';
const FETCH_PATCH = `<script>
(function(){
  var _f=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith('/freebox/'))
      u='/freebox'+u;
    return _f.call(this,u,o);
  };
})();
</script>`;

app.use('/freebox', createProxyMiddleware({
  target: FREEBOX_REMOTE_URL,
  changeOrigin: true,
  pathRewrite: { '^/freebox': '' },
  selfHandleResponse: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
      const ct = proxyRes.headers['content-type'] || '';
      const isHtml = ct.includes('text/html');

      // Transférer les headers (sauf content-length car on va modifier le body HTML)
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (k.toLowerCase() !== 'content-length') res.setHeader(k, v);
      });
      res.statusCode = proxyRes.statusCode;

      if (!isHtml) return proxyRes.pipe(res);

      // Décompresser si nécessaire, injecter le patch fetch avant </head>
      const enc = proxyRes.headers['content-encoding'] || '';
      let stream = proxyRes;
      if (enc === 'gzip')   stream = proxyRes.pipe(zlib.createGunzip());
      if (enc === 'br')     stream = proxyRes.pipe(zlib.createBrotliDecompress());
      if (enc === 'deflate')stream = proxyRes.pipe(zlib.createInflate());
      res.removeHeader('content-encoding');

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        // Injecter patch avant </head>
        html = html.replace('</head>', FETCH_PATCH + '</head>');
        res.setHeader('content-length', Buffer.byteLength(html));
        res.end(html);
      });
      stream.on('error', () => res.end());
    },
    error: (_err, _req, res) => {
      res.status(502).send('Freebox Remote inaccessible — lancer : cd ~/Desktop/freebox-remote && node server.js');
    }
  }
}));

app.use(express.static(path.join(__dirname, 'public'), { index: 'cylan.html' }));
app.get('/api/status',  (_req, res) => res.json({
  ok:      true,
  device:  DEVICE_SN,
  port:    PORT,
  secured: !!ACCESS_KEY
}));

const httpServer = http.createServer(app);
const wss        = new WebSocket.Server({ server: httpServer, path: '/ws' });

// ── Session navigateur ────────────────────────────────────────────────────────
wss.on('connection', (browser, req) => {
  // Vérification clé API via query string au moment de la connexion WS
  if (ACCESS_KEY) {
    const url = new URL(req.url, `http://localhost`);
    if (url.searchParams.get('key') !== ACCESS_KEY) {
      browser.close(4401, 'Clé API invalide');
      return;
    }
  }

  console.log('[browser] connecté depuis', req.socket.remoteAddress);

  let cylan = null;
  let sid   = null;
  let ready = false;

  function toBrowser(obj) {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(obj));
  }

  // ── Construction d'un message Cylan ─────────────────────────────────────
  function cylanMsg(messageType, payload) {
    return JSON.stringify({
      opcode:       'message',
      toSerialCode: DEVICE_SN,
      permitCode:   PERMIT_CODE,
      message:      typeof payload === 'string' ? payload : JSON.stringify(payload),
      sid,
      messageType,
      reqId:        reqId()
    });
  }

  // ── Connexion Cylan ──────────────────────────────────────────────────────
  async function connectCylan() {
    try { SESSID = await loginToFast(); console.log('[login] OK'); }
    catch (e) { console.warn('[login] cache utilisé:', e.message); }

    cylan = new WebSocket(CYLAN_IM, WS_OPTS);

    cylan.on('open', () => {
      cylan.send(JSON.stringify({
        secret: SECRET, opcode: 'signin',
        serialCode: SESSID, reUseSid: 0,
        key: 'cylanWebRtc', reqId: reqId(), loginType: 0
      }));
    });

    cylan.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.opcode === 'signin') {
          if (msg.code === 0) {
            sid = msg.sid; ready = true;
            console.log('[cylan] signin OK sid:', sid);
            toBrowser({ type: 'ready', iceServers: buildIce(msg) });
          } else {
            toBrowser({ type: 'error', message: `Signin refusé (code ${msg.code})` });
          }

        } else if (msg.opcode === 'message') {
          let inner = {};
          try { inner = JSON.parse(msg.message || '{}'); } catch {}

          switch (msg.messageType) {
            case 'callResponse':
              console.log('[cylan] answer reçu');
              toBrowser({ type: 'answer', sdp: inner.sdp });
              break;
            case 'remoteCandidate':
              toBrowser({ type: 'candidate', candidate: inner.candidate, sdpMid: inner.sdpMid, sdpMLineIndex: inner.sdpMLineIndex });
              break;
            case 'switchVideo':
              console.log('[cylan] switchVideo');
              toBrowser({ type: 'switchVideo' });
              break;
            case 'snapShot':
              // La caméra confirme la prise de vue (optionnel)
              toBrowser({ type: 'snapShotAck' });
              break;
            case 'hangup':
              console.log('[cylan] hangup');
              toBrowser({ type: 'hangup' });
              break;
            default:
              // Transmettre tout autre message au navigateur
              toBrowser({ type: 'cameraMsg', messageType: msg.messageType, message: inner });
          }

        } else if (msg.opcode === 'heartbeat') {
          cylan.send(JSON.stringify({ opcode: 'heartbeat' }));
        }
      } catch (e) { console.error('[cylan] parse:', e.message); }
    });

    cylan.on('close',  (c, r) => { ready = false; toBrowser({ type: 'error', message: 'Cylan déconnecté' }); });
    cylan.on('error',  (e)    => { toBrowser({ type: 'error', message: e.message }); });
  }

  // ── Messages du navigateur ───────────────────────────────────────────────
  browser.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const ok  = () => ready && cylan && cylan.readyState === WebSocket.OPEN;

      switch (msg.type) {

        // Initialisation WebRTC
        case 'connect':
          await connectCylan().catch(e => toBrowser({ type: 'error', message: e.message }));
          break;

        case 'offer':
          if (!ok()) return toBrowser({ type: 'error', message: 'Non connecté' });
          cylan.send(JSON.stringify({
            opcode: 'message', videoCodecType: 0,
            callType: msg.callType ?? 0,   // 0=vidéo+audio
            volume: 0,
            toSerialCode: DEVICE_SN, permitCode: PERMIT_CODE,
            message: JSON.stringify({ type: 'offer', sdp: msg.sdp }),
            sid, messageType: 'callRequest', reqId: reqId()
          }));
          break;

        case 'candidate':
          if (!ok()) return;
          cylan.send(JSON.stringify({
            opcode: 'message', toSerialCode: DEVICE_SN, permitCode: PERMIT_CODE,
            message: JSON.stringify({ candidate: msg.candidate, type: 'candidate', sdpMLineIndex: msg.sdpMLineIndex, sdpMid: msg.sdpMid }),
            sid, messageType: 'remoteCandidate', reqId: reqId()
          }));
          break;

        // ── Contrôles caméra ───────────────────────────────────────────────

        // PTZ : { type:'ptz', action:'left'|'right'|'up'|'down'|'zoomin'|'zoomout'|'stop', speed:2 }
        case 'ptz':
          if (!ok()) return;
          cylan.send(cylanMsg('ptzControl', { action: msg.action, speed: msg.speed ?? 2, stop: msg.action === 'stop' }));
          break;

        // Qualité vidéo : { type:'quality', definition: 0|1 }  (0=SD, 1=HD)
        case 'quality':
          if (!ok()) return;
          cylan.send(cylanMsg('videoControl', { definition: msg.definition }));
          break;

        // Snapshot côté caméra (déclenche l'enregistrement sur la caméra)
        case 'snapShot':
          if (!ok()) return;
          cylan.send(cylanMsg('snapShot', ''));
          break;

        // Raccrocher
        case 'hangup':
          if (ok()) cylan.send(cylanMsg('hangup', ''));
          break;
      }
    } catch (e) { console.error('[browser] msg:', e.message); }
  });

  browser.on('close', () => {
    console.log('[browser] déconnecté');
    if (cylan) {
      if (ready) try { cylan.send(cylanMsg('hangup', '')); } catch {}
      cylan.close();
    }
  });

  browser.on('error', (e) => console.error('[browser] WS:', e.message));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildIce(msg) {
  const s = [];
  if (msg.turnAddr) msg.turnAddr.forEach((u, i) =>
    s.push({ urls: u, username: msg.turnUser?.[i] || 'ade1', credential: msg.turnPass?.[i] || 'eXuvLVA' })
  );
  if (msg.stunAddr?.length) s.push({ urls: msg.stunAddr });
  return s;
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n────────────────────────────────────────────────');
  console.log('  Im Cam — Plateforme WebRTC v2');
  console.log('────────────────────────────────────────────────');
  console.log(`  Local     : ${url}`);
  console.log(`  Réseau    : http://<IP-Mac>:${PORT}`);
  console.log(`  Caméra    : ${DEVICE_SN}`);
  if (ACCESS_KEY) console.log(`  Sécurisé  : oui (ACCESS_KEY défini)`);
  console.log('  Arrêter   : Ctrl+C');
  console.log('────────────────────────────────────────────────\n');
});
