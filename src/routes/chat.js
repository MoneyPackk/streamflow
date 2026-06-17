const express = require('express');
const { exec } = require('child_process');

const ALLOWED_COMMANDS = [
  'restart site', 'check logs', 'git pull and deploy', 'status', 'full status',
  'restart', 'logs', 'deploy', 'update', 'pull', 'uptime', 'disk', 'memory',
  'rebuild', 'health'
];

function chatRoutes() {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command required' });
    }

    const cmd = command.toLowerCase().trim();
    let shellCmd;

    if (cmd.includes('restart') || cmd === 'restart site') {
      shellCmd = 'systemctl restart streamflow && sleep 1 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000';
    } else if (cmd.includes('log') || cmd === 'check logs') {
      shellCmd = 'journalctl -u streamflow --no-pager -n 15';
    } else if (cmd.includes('deploy') || cmd.includes('pull') || cmd.includes('update')) {
      shellCmd = 'cd /opt/streamflow && git pull origin master && npm install --omit=dev 2>&1 | tail -5 && systemctl restart streamflow && sleep 2 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3000';
    } else if (cmd.includes('status') || cmd.includes('health')) {
      shellCmd = 'echo "=== System ===" && uptime && echo && echo "=== Disk ===" && df -h / && echo && echo "=== Memory ===" && free -h && echo && echo "=== StreamFlow ===" && systemctl is-active streamflow && curl -s -o /dev/null -w "HTTP %{http_code}\\n" http://localhost:3000 && echo && echo "=== Terminal ===" && systemctl is-active peacock-terminal 2>/dev/null && curl -s -o /dev/null -w "HTTP %{http_code}\\n" http://localhost:8080';
    } else if (cmd.includes('disk')) {
      shellCmd = 'df -h /';
    } else if (cmd.includes('memory') || cmd.includes('mem')) {
      shellCmd = 'free -h';
    } else if (cmd.includes('uptime')) {
      shellCmd = 'uptime';
    } else {
      return res.json({ output: 'Unknown command. Try: restart, logs, deploy, status, disk, memory' });
    }

    exec(shellCmd, { timeout: 30000 }, (err, stdout, stderr) => {
      const output = stdout || stderr || (err ? err.message : 'Done');
      res.json({ output: output.trim() });
    });
  });

  return router;
}

module.exports = chatRoutes;
