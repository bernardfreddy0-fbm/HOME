const express  = require('express');
const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const http      = require('http');

const config    = require('./config');

const RTSP_PATHS = [
  '/stream',
  '/live/ch0',
  '/live/main',
  '/h264/ch1/main/av_stream',
  '/cam/realmonitor?channel=1&subtype=0',
  '/videoMain',
];

const HLS_DIR = path.join(os.tmpdir(), 'imcam-hls');
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

const app = express();
app.use(express.json());

let ffmpegProc     = null;
let currentUrl     = null;
let streamReady    = false;
let pathIndex      = 0;
let pathOverride   = null;

// ── Basic auth (optionnel) ─────────────────────────────────────────────────
if (config.authUser && config.authPass) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    const b64  = Buffer.from(`${config.authUser}:${config.authPass}`).toString('base64');
    if (auth === `Basic ${b64}`) return next();
    res.set('WWW-Authenticate', 'Basic realm="Im Cam"');
    res.status(401).send('Authentification requise');
  });
}

// ── FFmpeg ─────────────────────────────────────────────────────────────────
function buildUrl(rtspPath) {
  const { cameraIp, cameraUser, cameraPass } = config;
  return `rtsp://${cameraUser}:${cameraPass}@${cameraIp}:554${rtspPath}`;
}

function sanitize(url) {
  return url.replace(/:([^:@]+)@/, ':*****@');
}

function startFfmpeg(rtspUrl) {
  if (ffmpegProc) { ffmpegProc.kill('SIGKILL'); ffmpegProc = null; }
  streamReady = false;
  currentUrl  = rtspUrl;

  const m3u8 = path.join(HLS_DIR, 'cam.m3u8');
  const args  = [
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl,
    '-c:v', 'copy', '-an',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+omit_endlist',
    m3u8,
  ];

  console.log(`[stream] Connexion à ${sanitize(rtspUrl)}`);
  ffmpegProc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

  let connected = false;
  const timer   = setTimeout(() => {
    if (!connected) {
      console.log(`[stream] Timeout — chemin non supporté`);
      if (!pathOverride) tryNextPath();
    }
  }, 8_000);

  ffmpegProc.stderr.on('data', (chunk) => {
    const txt = chunk.toString();
    if (!connected && (txt.includes('Stream mapping') || txt.includes('Output #0'))) {
      connected   = true;
      streamReady = true;
      clearTimeout(timer);
      console.log('[stream] Flux HLS prêt.');
    }
    if (!connected && (
      txt.includes('Connection refused') ||
      txt.includes('401 Unauthorized') ||
      txt.includes('No route to host') ||
      txt.includes('Invalid data found')
    )) {
      clearTimeout(timer);
      if (!pathOverride) tryNextPath();
    }
  });

  ffmpegProc.on('exit', (code) => {
    streamReady = false;
    if (code !== 0 && connected) {
      console.log('[stream] FFmpeg arrêté — reconnexion dans 3 s...');
      setTimeout(() => startFfmpeg(currentUrl), 3_000);
    }
  });
}

function tryNextPath() {
  pathIndex = (pathIndex + 1) % RTSP_PATHS.length;
  startFfmpeg(buildUrl(RTSP_PATHS[pathIndex]));
}

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/stream', express.static(HLS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (_req, res) => {
  res.json({
    ready:      streamReady,
    url:        currentUrl ? sanitize(currentUrl) : null,
    pathIndex,
    totalPaths: RTSP_PATHS.length,
  });
});

app.post('/api/next', (_req, res) => {
  pathOverride = null;
  tryNextPath();
  res.json({ ok: true, pathIndex });
});

app.post('/api/connect', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url requis' });
  pathOverride = url;
  startFfmpeg(url);
  res.json({ ok: true });
});

// ── Démarrage ──────────────────────────────────────────────────────────────
const server = http.createServer(app);

server.listen(config.port, async () => {
  console.log('────────────────────────────────────────');
  console.log('  Im Cam — Lecteur flux caméra IP');
  console.log('────────────────────────────────────────');
  console.log(`  Interface : http://localhost:${config.port}`);
  console.log('  Arrêter   : Ctrl+C');
  console.log('────────────────────────────────────────');
  console.log(`[server] Serveur démarré sur http://localhost:${config.port}`);
  console.log(`[server] Caméra cible : ${config.cameraIp}:554`);

  if (config.tunnel === 'cloudflared') {
    const { startTunnel } = require('./tunnel');
    try {
      const { url } = await startTunnel(config.port);
      const sep = '─'.repeat(url.length + 18);
      console.log(`\n${sep}`);
      console.log(`  Accès distant : ${url}`);
      if (config.authUser) {
        console.log(`  Identifiant   : ${config.authUser}`);
        console.log(`  Mot de passe  : ${config.authPass}`);
      }
      console.log(`${sep}\n`);
    } catch (e) {
      console.error('[tunnel] Erreur :', e.message);
    }
  }

  startFfmpeg(buildUrl(RTSP_PATHS[pathIndex]));
});
