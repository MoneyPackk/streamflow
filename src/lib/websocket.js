const WebSocket = require('ws');

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
            // Simple token-based auth for WS
            userId = msg.userId || null;
            ws.send(JSON.stringify({ type: 'auth_ok', userId }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          case 'progress':
            // Real-time watch progress
            if (userId && msg.tmdbId) {
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
            if (msg.partyId) {
              ws.partyId = msg.partyId;
              ws.send(JSON.stringify({ type: 'subscribed', partyId: msg.partyId }));
            }
            break;
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
      message: 'PeacocksStreams real-time connected',
      timestamp: new Date().toISOString(),
    }));
  });

  return { wss, broadcast };
}

function broadcast(partyId, event) {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.partyId === partyId) {
      client.send(JSON.stringify(event));
    }
  });
}

module.exports = { initWebSocket, broadcast };
