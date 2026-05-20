const { spawn } = require("child_process");
const http = require("http");

let tunnelProc = null;

function startTunnel(provider, port) {
  return new Promise((resolve, reject) => {
    if (provider === "cloudflared") return startCloudflared(port, resolve, reject);
    if (provider === "ngrok")       return startNgrok(port, resolve, reject);
    reject(new Error(`Fournisseur de tunnel inconnu : ${provider}`));
  });
}

function startCloudflared(port, resolve, reject) {
  // Tunnel anonyme Cloudflare (aucun compte requis)
  tunnelProc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const timer = setTimeout(
    () => reject(new Error("Timeout : URL cloudflared non reçue après 30s")),
    30_000
  );

  function onData(d) {
    const text = d.toString();
    // cloudflared affiche l'URL dans stderr
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      clearTimeout(timer);
      tunnelProc.stderr.removeListener("data", onData);
      resolve(match[0]);
    }
  }

  tunnelProc.stdout.on("data", onData);
  tunnelProc.stderr.on("data", onData);
  tunnelProc.on("error", (err) => { clearTimeout(timer); reject(err); });
  tunnelProc.on("close", (code) => {
    if (code && code !== 0) console.log(`[tunnel] cloudflared terminé (code ${code})`);
  });
}

function startNgrok(port, resolve, reject) {
  const args = ["http", String(port)];
  const config = require("./config");
  if (config.tunnel.ngrokToken) args.unshift("--authtoken", config.tunnel.ngrokToken);

  tunnelProc = spawn("ngrok", args, { stdio: "ignore" });

  tunnelProc.on("error", reject);

  // Interroger l'API locale de ngrok une fois démarré
  const start = Date.now();
  function poll() {
    http.get("http://localhost:4040/api/tunnels", (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const tunnels = JSON.parse(data).tunnels || [];
          const t = tunnels.find((t) => t.proto === "https");
          if (t) return resolve(t.public_url);
        } catch (_) {}
        if (Date.now() - start > 30_000) return reject(new Error("Timeout ngrok"));
        setTimeout(poll, 1000);
      });
    }).on("error", () => {
      if (Date.now() - start > 30_000) return reject(new Error("Timeout ngrok"));
      setTimeout(poll, 1500);
    });
  }
  setTimeout(poll, 2000);
}

function stopTunnel() {
  if (tunnelProc) {
    tunnelProc.kill("SIGTERM");
    tunnelProc = null;
  }
}

module.exports = { startTunnel, stopTunnel };
