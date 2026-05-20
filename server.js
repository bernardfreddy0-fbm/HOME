const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const app = express();
const HLS_DIR = config.server.hlsDir;

// État du processus FFmpeg
let ffmpegProc = null;
let streamReady = false;
let currentRtspUrl = null;
let restartTimer = null;
let probeIndex = 0;

function getRtspUrl(pathIndex) {
  if (config.camera.rtspUrl) return config.camera.rtspUrl;
  const { ip, rtspPort, user, pass, rtspPaths } = config.camera;
  const p = rtspPaths[pathIndex % rtspPaths.length];
  const auth = pass ? `${user}:${pass}@` : `${user}@`;
  return `rtsp://${auth}${ip}:${rtspPort}${p}`;
}

function ensureHlsDir() {
  if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
}

function cleanHlsDir() {
  if (!fs.existsSync(HLS_DIR)) return;
  fs.readdirSync(HLS_DIR).forEach((f) => {
    if (f.endsWith(".ts") || f.endsWith(".m3u8"))
      fs.unlinkSync(path.join(HLS_DIR, f));
  });
}

function startStream(rtspUrl) {
  ensureHlsDir();
  cleanHlsDir();
  currentRtspUrl = rtspUrl;
  streamReady = false;

  const m3u8 = path.join(HLS_DIR, "cam.m3u8");
  const args = [
    "-loglevel", "warning",
    "-rtsp_transport", config.hls.transport,
    "-i", rtspUrl,
    "-c:v", "copy",
    "-an",
    "-f", "hls",
    "-hls_time", String(config.hls.segmentDuration),
    "-hls_list_size", String(config.hls.listSize),
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", path.join(HLS_DIR, "seg%03d.ts"),
    m3u8,
  ];

  console.log(`[stream] Connexion à ${rtspUrl.replace(/:([^@]+)@/, ":*****@")}`);
  ffmpegProc = spawn("ffmpeg", args);

  ffmpegProc.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[ffmpeg] ${msg}`);
  });

  // Le flux est prêt dès que le fichier m3u8 existe
  const readyCheck = setInterval(() => {
    if (fs.existsSync(m3u8)) {
      streamReady = true;
      clearInterval(readyCheck);
      console.log("[stream] Flux HLS prêt.");
    }
  }, 500);

  ffmpegProc.on("close", (code) => {
    clearInterval(readyCheck);
    streamReady = false;
    ffmpegProc = null;
    if (code !== 0 && code !== null) {
      console.log(`[stream] FFmpeg terminé (code ${code}), redémarrage dans 5s…`);
      restartTimer = setTimeout(() => startStream(currentRtspUrl), 5000);
    }
  });
}

function stopStream() {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  if (ffmpegProc) { ffmpegProc.kill("SIGTERM"); ffmpegProc = null; }
  streamReady = false;
}

// ── Routes API ─────────────────────────────────────────────────────────────

app.use(express.json());

// Statut du flux
app.get("/api/status", (req, res) => {
  res.json({
    ready: streamReady,
    rtspUrl: currentRtspUrl
      ? currentRtspUrl.replace(/:([^@]+)@/, ":*****@")
      : null,
    hlsUrl: streamReady ? "/stream/cam.m3u8" : null,
  });
});

// Lancer le flux avec une URL RTSP précise
app.post("/api/start", (req, res) => {
  const { rtspUrl } = req.body || {};
  if (!rtspUrl)
    return res.status(400).json({ error: "Paramètre rtspUrl manquant" });
  stopStream();
  startStream(rtspUrl);
  res.json({ ok: true, message: "Démarrage du flux…" });
});

// Arrêter le flux
app.post("/api/stop", (req, res) => {
  stopStream();
  res.json({ ok: true });
});

// Probe : essayer les URL RTSP dans l'ordre
app.post("/api/probe", (req, res) => {
  const count = config.camera.rtspPaths.length;
  const url = getRtspUrl(probeIndex);
  probeIndex = (probeIndex + 1) % count;
  stopStream();
  startStream(url);
  res.json({ ok: true, tried: url.replace(/:([^@]+)@/, ":*****@"), remaining: count - probeIndex });
});

// ── Servir les segments HLS ────────────────────────────────────────────────

app.use("/stream", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store");
  next();
}, express.static(HLS_DIR));

// ── Frontend statique ──────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "public")));

// ── Démarrage ─────────────────────────────────────────────────────────────

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`[server] Serveur démarré sur http://localhost:${PORT}`);
  console.log(`[server] Caméra cible : ${config.camera.ip}:${config.camera.rtspPort}`);
  // Lancer le flux automatiquement au démarrage
  startStream(getRtspUrl(0));
});

process.on("SIGINT", () => { stopStream(); process.exit(0); });
process.on("SIGTERM", () => { stopStream(); process.exit(0); });
