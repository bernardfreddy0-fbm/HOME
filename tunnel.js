const { spawn } = require('child_process');

function startTunnel(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handleData = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) resolve({ url: match[0], proc });
    };

    proc.stdout.on('data', handleData);
    proc.stderr.on('data', handleData);
    proc.on('exit', () => reject(new Error('cloudflared s\'est arrêté de façon inattendue')));

    setTimeout(() => reject(new Error('Timeout tunnel (30s)')), 30_000);
  });
}

module.exports = { startTunnel };
