const express = require('express');
const { exec } = require('child_process');
const { adminOnly } = require('../middleware/auth');

function chatRoutes() {
  const router = express.Router();

  // Admin-only protected endpoint - allows only safe system status checks
  const ADMIN_COMMANDS = new Map([
    ['status', 'systemctl is-active streamflow && echo "Status: active"'],
    ['health', 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && echo "Health check status: %{http_code}"'],
    ['memory', 'free -h'],
    ['disk', 'df -h /'],
    ['uptime', 'uptime'],
  ]);

  // Security patterns: input validation, immutable patterns, no hardcoded secrets
  const sanitizeCommand = (input) => {
    if (!input || typeof input !== 'string') {
      throw new Error('Command required');
    }

    const command = input.toLowerCase().trim();

    // Only allow specific, safe commands
    if (!ADMIN_COMMANDS.has(command)) {
      throw new Error(`Command not allowed. Try: ${Array.from(ADMIN_COMMANDS.keys()).join(', ')}`);
    }

    return ADMIN_COMMANDS.get(command);
  };

  // CRITICAL: This endpoint requires admin authentication
  router.post('/', adminOnly, (req, res) => {
    try {
      // Input validation: allow only predefined safe commands
      const shellCmd = sanitizeCommand(req.body?.command);

      // Execute with strict limits
      exec(shellCmd, { timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('Command execution failed:', err);
          return res.json({ output: `Command failed: ${err.message}` });
        }

        const output = stdout || stderr || 'Command completed';
        res.json({ output: output.trim() });
      });
    } catch (error) {
      console.error('Invalid command request:', error);
      return res.status(400).json({ error: error.message || 'Invalid command' });
    }
  });

  return router;
}

module.exports = chatRoutes;
