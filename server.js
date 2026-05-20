const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { startTunnel, stopTunnel } = require("./tunnel");

const app = express();
const HLS_DIR = config.server.hlsDir;

// État du processus FFmpeg
let publicUrl = null;   // URL du tunnel si actif

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

// ── Authentification HTTP basique ─────────────────────────────────────────

function basicAuth(req, res, next) {
  const { user, pass } = config.auth;
  if (!user) return next();
  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass)
      return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Im Cam"').status(401).end();
}

app.use(basicAuth);

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
    publicUrl: publicUrl || null,
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
app.listen(PORT, async () => {
  console.log(`[server] Serveur démarré sur http://localhost:${PORT}`);
  console.log(`[server] Caméra cible : ${config.camera.ip}:${config.camera.rtspPort}`);

  if (config.auth.user) {
    console.log(`[server] Authentification activée (utilisateur : ${config.auth.user})`);
  } else {
    console.log("[server] ⚠  Auth désactivée — définir AUTH_USER/AUTH_PASS avant d'exposer sur internet");
  }

  // Lancer le tunnel si demandé
  if (config.tunnel.provider !== "none") {
    console.log(`[tunnel] Démarrage du tunnel ${config.tunnel.provider}…`);
    try {
      publicUrl = await startTunnel(config.tunnel.provider, PORT);
      const sep = "─".repeat(60);
      console.log(`\n${sep}`);
      console.log(`  Accès distant : ${publicUrl}`);
      if (config.auth.user) {
        console.log(`  Identifiant   : ${config.auth.user}`);
        console.log(`  Mot de passe  : ${config.auth.pass}`);
      }
      console.log(`${sep}\n`);
    } catch (err) {
      console.error(`[tunnel] Échec : ${err.message}`);
      console.error("[tunnel] Vérifier que cloudflared/ngrok est installé (brew install cloudflared)");
    }
  }

  // Lancer le flux automatiquement au démarrage
  startStream(getRtspUrl(0));
});

process.on("SIGINT",  () => { stopStream(); stopTunnel(); process.exit(0); });
process.on("SIGTERM", () => { stopStream(); stopTunnel(); process.exit(0); });
