// Capture la fenêtre Im Cam via screencapture -R et diffuse en MJPEG
// Usage : node screen-stream.js

const express        = require('express');
const { execFile }   = require('child_process');
const { readFileSync } = require('fs');
const path           = require('path');
const os             = require('os');
const http           = require('http');

const PORT       = parseInt(process.env.PORT || '8001', 10);
const FRAME_MS   = 250; // 4 FPS
const FRAME_PATH = path.join(os.tmpdir(), 'imcam_frame.jpg'); // JPEG = meilleure compat Safari

// Script Python pour récupérer les bounds de la fenêtre Im Cam
const PY_DETECT = `
import Quartz, json, sys
opts = Quartz.kCGWindowListOptionOnScreenOnly
wins = Quartz.CGWindowListCopyWindowInfo(opts, Quartz.kCGNullWindowID)
best = None
best_area = 0
for w in wins:
    if 'Im Cam' in w.get('kCGWindowOwnerName',''):
        b = w['kCGWindowBounds']
        area = b['Width'] * b['Height']
        if area > best_area:
            best_area = area
            best = b
if best and best['Width'] > 100 and best['Height'] > 200:
    top    = 82
    bottom = 390
    print(json.dumps({
        'x': int(best['X']),
        'y': int(best['Y']) + top,
        'w': int(best['Width']),
        'h': max(80, int(best['Height']) - top - bottom)
    }))
    sys.exit(0)
sys.exit(1)
`.trim();

const app = express();
let lastFrame         = null;
let appBounds         = null;
let capturing         = false;
let consecutiveErrors = 0;
let lastDetect        = 0;

// ── Détecter la zone vidéo Im Cam ─────────────────────────────────────────
function detectImCamWindow() {
  return new Promise((resolve) => {
    execFile('python3', ['-c', PY_DETECT], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) return resolve(null);
      try { resolve(JSON.parse(stdout.trim())); }
      catch { resolve(null); }
    });
  });
}

// ── Capturer la région ────────────────────────────────────────────────────
function captureRegion(b) {
  return new Promise((resolve, reject) => {
    const region = `${b.x},${b.y},${b.w},${b.h}`;
    execFile('screencapture', ['-R', region, '-t', 'jpg', '-x', FRAME_PATH], { timeout: 2000 }, (err) => {
      if (err) return reject(err);
      try { resolve(readFileSync(FRAME_PATH)); }
      catch (e) { reject(e); }
    });
  });
}

// ── Boucle de capture ─────────────────────────────────────────────────────
async function captureLoop() {
  capturing = true;

  while (capturing) {
    const t = Date.now();

    // Redétecter la fenêtre toutes les 5s ou après erreurs
    if (!appBounds || consecutiveErrors > 3 || Date.now() - lastDetect > 5000) {
      appBounds = await detectImCamWindow();
      lastDetect = Date.now();

      if (!appBounds) {
        console.warn('[capture] Im Cam non détecté — attente 2s...');
        consecutiveErrors = 0;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      console.log(`[capture] Zone vidéo : x=${appBounds.x} y=${appBounds.y} w=${appBounds.w} h=${appBounds.h}`);
    }

    try {
      const frame = await captureRegion(appBounds);
      if (frame && frame.length > 1000) {
        lastFrame = frame;
        consecutiveErrors = 0;
      }
    } catch {
      consecutiveErrors++;
    }

    const wait = Math.max(0, FRAME_MS - (Date.now() - t));
    await new Promise(r => setTimeout(r, wait));
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

app.get('/stream', (req, res) => {
  // Boundary standard MJPEG (sans tirets dans la valeur, tirets ajoutés dans chaque part)
  res.writeHead(200, {
    'Content-Type':  'multipart/x-mixed-replace; boundary=imcamboundary',
    'Cache-Control': 'no-cache, no-store',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const push = () => {
    if (!lastFrame) return;
    const head = Buffer.from(
      '--imcamboundary\r\n' +
      'Content-Type: image/jpeg\r\n' +
      `Content-Length: ${lastFrame.length}\r\n` +
      '\r\n'
    );
    res.write(head);
    res.write(lastFrame);
    res.write(Buffer.from('\r\n'));
  };

  push();
  const interval = setInterval(push, FRAME_MS);
  req.on('close', () => clearInterval(interval));
});

app.get('/frame.jpg', (_req, res) => {
  if (!lastFrame) return res.status(503).send('Pas encore de frame');
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-cache');
  res.send(lastFrame);
});

app.get('/api/status', (_req, res) => {
  res.json({ ready: !!lastFrame, bounds: appBounds, fps: Math.round(1000 / FRAME_MS) });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'viewer.html')));

// ── Démarrage ─────────────────────────────────────────────────────────────
http.createServer(app).listen(PORT, () => {
  console.log('────────────────────────────────────────');
  console.log('  Im Cam — Diffusion écran Mac');
  console.log('────────────────────────────────────────');
  console.log(`  Interface    : http://localhost:${PORT}`);
  console.log(`  Stream MJPEG : http://localhost:${PORT}/stream`);
  console.log(`  Frame debug  : http://localhost:${PORT}/frame.png`);
  console.log('  Arrêter      : Ctrl+C');
  console.log('────────────────────────────────────────');
  console.log('[info] Im Cam doit rester ouvert et visible à l\'écran');
  captureLoop();
});
