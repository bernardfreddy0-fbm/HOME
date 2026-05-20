module.exports = {
  camera: {
    ip: process.env.CAMERA_IP || "192.168.1.150",
    rtspPort: parseInt(process.env.CAMERA_RTSP_PORT) || 554,
    user: process.env.CAMERA_USER || "admin",
    pass: process.env.CAMERA_PASS || "admin",
    // URL RTSP complète (remplace les champs individuels si définie)
    rtspUrl: process.env.RTSP_URL || null,
    // Chemins RTSP à essayer dans l'ordre
    rtspPaths: [
      "/stream",
      "/live/ch0",
      "/live/main",
      "/h264/ch1/main/av_stream",
      "/cam/realmonitor?channel=1&subtype=0",
      "/videoMain",
    ],
  },
  server: {
    port: parseInt(process.env.PORT) || 8000,
    hlsDir: process.env.HLS_DIR || "/tmp/hls-stream",
  },
  hls: {
    segmentDuration: 2,  // secondes par segment
    listSize: 3,         // segments en mémoire
    transport: process.env.RTSP_TRANSPORT || "tcp",
  },
  // Authentification HTTP basique (obligatoire pour l'accès distant)
  auth: {
    user: process.env.AUTH_USER || "",   // vide = auth désactivée
    pass: process.env.AUTH_PASS || "",
  },
  // Tunnel vers internet : "cloudflared" | "ngrok" | "none"
  tunnel: {
    provider: process.env.TUNNEL || "none",
    ngrokToken: process.env.NGROK_TOKEN || "",
  },
};
