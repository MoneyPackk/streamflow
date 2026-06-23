const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { JWT_SECRET } = require('../config/config');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    let userId = null;
    let heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'auth':
            // Secure authentication - verify JWT token
            const token = msg.token;
            if (!token) {
              return ws.send(JSON.stringify({ type: 'auth_failed', message: 'Token required' }));
            }

            try {
              const decoded = await jwt.verify(token, JWT_SECRET);
              userId = decoded.sub;
              ws.userId = decoded.sub;
              ws.isAdmin = !!decoded.is_admin;
              ws.send(JSON.stringify({ type: 'auth_ok', userId, isAdmin: !!decoded.is_admin }));
              break;
            } catch (authError) {
              return ws.send(JSON.stringify({ type: 'auth_failed', message: 'Invalid or expired token' }));
            }

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          case 'progress':
            // Real-time watch progress
            if (ws.userId && msg.tmdbId) {
              ws.send(JSON.stringify({
                type: 'progress_ack',
                tmdbId: msg.tmdbId,
                episode: msg.episode,
                progress: msg.progressSeconds,
              }));
            }
            break;

          case 'subscribe':
            // Subscribe to watch party events
            if (msg.partyId && ws.userId) {
              ws.partyId = msg.partyId;
              ws.send(JSON.stringify({ type: 'subscribed', partyId: msg.partyId }));
            }
            break;

          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Streamora real-time connected',
      timestamp: new Date().toISOString(),
    }));
  });

  return { wss, broadcast };
}

function broadcast(partyId, event) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && (partyId === undefined || client.partyId === partyId)) {
      client.send(JSON.stringify(event));
    }
  });
}

module.exports = { initWebSocket, broadcast };
