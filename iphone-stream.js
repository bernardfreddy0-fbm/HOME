// Capture l'écran iPhone via USB (idevicescreenshot ou pymobiledevice3)
// et diffuse en MJPEG sur http://localhost:PORT

const express    = require('express');
const { execFile, spawn } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const http       = require('http');

const PORT          = parseInt(process.env.PORT || '8001', 10);
const FRAME_MS      = 250; // 4 FPS
const FRAME_PATH    = path.join(os.tmpdir(), 'iphone_frame.png');

const app = express();
let lastFrame = null;
let captureMethod = null;
let iPhoneConnected = false;

// ── Méthode A : idevicescreenshot ──────────────────────────────────────────
function captureViaIdevice() {
  return new Promise((resolve, reject) => {
    execFile('idevicescreenshot', [FRAME_PATH], { timeout: 3000 }, (err) => {
      if (err) return reject(err);
      try { resolve(fs.readFileSync(FRAME_PATH)); }
      catch (e) { reject(e); }
    });
  });
}

// ── Méthode B : pymobiledevice3 (API async) ────────────────────────────────
const PY_SCRIPT = `
import sys, asyncio
async def main():
    try:
        from pymobiledevice3.lockdown import create_using_usbmux
        from pymobiledevice3.services.screenshot import ScreenshotService
        async with create_using_usbmux() as ld:
            data = await ScreenshotService(ld).take_screenshot()
            sys.stdout.buffer.write(data)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)
asyncio.run(main())
`.trim();

function captureViaPymobiledevice() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-c', PY_SCRIPT]);
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.on('close', (code) => {
      if (code !== 0 || !chunks.length) return reject(new Error('pymobiledevice3 échec'));
      resolve(Buffer.concat(chunks));
    });
  });
}

// ── Détection automatique de la méthode ───────────────────────────────────
async function detectMethod() {
  console.log('[detect] Test idevicescreenshot...');
  try {
    await captureViaIdevice();
    console.log('[detect] ✅ idevicescreenshot fonctionne');
    return 'idevicescreenshot';
  } catch { /* pas disponible */ }

  console.log('[detect] Test pymobiledevice3...');
  try {
    await captureViaPymobiledevice();
    console.log('[detect] ✅ pymobiledevice3 fonctionne');
    return 'pymobiledevice3';
  } catch { /* pas disponible */ }

  return null;
}

async function captureFrame() {
  if (captureMethod === 'idevicescreenshot') return captureViaIdevice();
  if (captureMethod === 'pymobiledevice3')   return captureViaPymobiledevice();
  throw new Error('Aucune méthode disponible');
}

// ── Boucle de capture ─────────────────────────────────────────────────────
async function startCapture() {
  captureMethod = await detectMethod();

  if (!captureMethod) {
    console.error('\n[capture] ❌ Aucun outil de capture détecté.');
    console.error('[capture] Solutions :');
    console.error('[capture]   brew install libimobiledevice');
    console.error('[capture]   pip3 install pymobiledevice3\n');
    return;
  }

  iPhoneConnected = true;
  console.log(`[capture] Démarrage capture iPhone (${FRAME_MS} ms / frame)`);

  while (true) {
    const t = Date.now();
    try {
      const frame = await captureFrame();
      if (frame && frame.length > 0) lastFrame = frame;
      if (!iPhoneConnected) { iPhoneConnected = true; console.log('[capture] iPhone reconnecté.'); }
    } catch {
      if (iPhoneConnected) { iPhoneConnected = false; console.warn('[capture] iPhone déconnecté ou en veille.'); }
    }
    const wait = Math.max(0, FRAME_MS - (Date.now() - t));
    await new Promise(r => setTimeout(r, wait));
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

// Flux MJPEG (pour <img src="/stream">)
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'multipart/x-mixed-replace; boundary=--frame',
    'Cache-Control': 'no-cache, no-store',
    'Connection':    'keep-alive',
  });

  const push = () => {
    if (!lastFrame) return;
    res.write('----frame\r\n');
    res.write('Content-Type: image/png\r\n\r\n');
    res.write(lastFrame);
    res.write('\r\n');
  };

  push(); // première frame immédiate
  const interval = setInterval(push, FRAME_MS);
  req.on('close', () => clearInterval(interval));
});

// Frame unique (pour debug)
app.get('/frame.png', (_req, res) => {
  if (!lastFrame) return res.status(503).json({ error: 'Pas encore de frame' });
  res.set('Content-Type', 'image/png');
  res.send(lastFrame);
});

// Statut JSON
app.get('/api/status', (_req, res) => {
  res.json({
    connected: iPhoneConnected,
    method:    captureMethod,
    hasFrame:  !!lastFrame,
  });
});

// Interface web
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'iphone.html')));

// ── Démarrage ─────────────────────────────────────────────────────────────
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log('────────────────────────────────────────');
  console.log('  Im Cam — Capture iPhone USB');
  console.log('────────────────────────────────────────');
  console.log(`  Interface    : http://localhost:${PORT}`);
  console.log(`  Stream MJPEG : http://localhost:${PORT}/stream`);
  console.log(`  Frame debug  : http://localhost:${PORT}/frame.png`);
  console.log('  Arrêter      : Ctrl+C');
  console.log('────────────────────────────────────────');

  startCapture();
});
