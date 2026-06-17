const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function partiesRoutes(db, broadcast = () => {}) {
  const router = express.Router();

  // Create a watch party
  router.post('/', authenticate, (req, res, next) => {
    try {
      const { tmdb_id, media_type = 'movie', season_number, episode_number } = req.body;
      if (!tmdb_id) return res.status(400).json({ error: 'tmdb_id required' });
      const code = genCode();
      const result = db.prepare(
        'INSERT INTO parties (host_id, code, tmdb_id, media_type, season_number, episode_number) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.user.id, code, tmdb_id, media_type, season_number || null, episode_number || null);
      db.prepare('INSERT INTO party_members (party_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, req.user.id);
      broadcast(result.lastInsertRowid, { type: 'party_created', code, party_id: result.lastInsertRowid });
      res.status(201).json({ success: true, code, id: result.lastInsertRowid });
    } catch (e) { next(e); }
  });

  // Get party details (by code or id)
  router.get('/:code', optionalAuth, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare(`
        SELECT p.*, u.username as host_username, u.pfp_skin as host_pfp
        FROM parties p
        JOIN users u ON p.host_id = u.id
        WHERE p.code = ? OR p.id = ?
      `).get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      const members = db.prepare(`
        SELECT u.id, u.username, u.pfp_skin, pm.joined_at
        FROM party_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.party_id = ?
        ORDER BY pm.joined_at ASC
      `).all(party.id);
      res.json({ party, members });
    } catch (e) { next(e); }
  });

  // Join a party
  router.post('/:code/join', authenticate, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare('SELECT * FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      db.prepare('INSERT OR IGNORE INTO party_members (party_id, user_id) VALUES (?, ?)').run(party.id, req.user.id);
      broadcast(party.id, { type: 'member_joined', user_id: req.user.id, username: req.user.username });
      res.json({ success: true, party_id: party.id });
    } catch (e) { next(e); }
  });

  // Leave a party
  router.post('/:code/leave', authenticate, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare('SELECT id, host_id FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      db.prepare('DELETE FROM party_members WHERE party_id = ? AND user_id = ?').run(party.id, req.user.id);
      // If host left, end the party
      if (party.host_id === req.user.id) {
        db.prepare('DELETE FROM parties WHERE id = ?').run(party.id);
      }
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // Update playback state (host only)
  router.post('/:code/state', authenticate, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare('SELECT * FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.host_id !== req.user.id) return res.status(403).json({ error: 'Only host can control playback' });
      const { current_time_seconds, is_playing } = req.body;
      db.prepare('UPDATE parties SET current_time_seconds = ?, is_playing = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?')
        .run(current_time_seconds || 0, is_playing ? 1 : 0, party.id);
      broadcast(party.id, { type: 'state', current_time_seconds: current_time_seconds || 0, is_playing: !!is_playing });
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // Get latest playback state (for guests to sync)
  router.get('/:code/state', optionalAuth, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare('SELECT current_time_seconds, is_playing, last_active FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      res.json(party);
    } catch (e) { next(e); }
  });

  // Party chat
  router.get('/:code/chat', optionalAuth, (req, res, next) => {
    try {
      const { code } = req.params;
      const party = db.prepare('SELECT id FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      const messages = db.prepare(`
        SELECT pc.id, pc.body, pc.created_at, u.username, u.pfp_skin
        FROM party_chat pc
        JOIN users u ON pc.user_id = u.id
        WHERE pc.party_id = ?
        ORDER BY pc.created_at ASC
        LIMIT 100
      `).all(party.id);
      res.json({ messages });
    } catch (e) { next(e); }
  });

  router.post('/:code/chat', authenticate, (req, res, next) => {
    try {
      const { code } = req.params;
      const { body } = req.body;
      if (!body || !body.trim()) return res.status(400).json({ error: 'Empty message' });
      const party = db.prepare('SELECT id FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      db.prepare('INSERT INTO party_chat (party_id, user_id, body) VALUES (?, ?, ?)').run(party.id, req.user.id, body.trim().substring(0, 500));
      db.prepare('UPDATE party_members SET last_seen = CURRENT_TIMESTAMP WHERE party_id = ? AND user_id = ?').run(party.id, req.user.id);
      broadcast(party.id, { type: 'chat', username: req.user.username, body: body.trim().substring(0, 500) });
      res.status(201).json({ success: true });
    } catch (e) { next(e); }
  });

  // Party reactions
  router.get('/:code/reactions', optionalAuth, (req, res, next) => {
    try {
      const { code } = req.params;
      const since = parseFloat(req.query.since) || 0;
      const party = db.prepare('SELECT id FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      const reactions = db.prepare(`
        SELECT pr.id, pr.emoji, pr.timestamp_seconds, pr.created_at, u.username
        FROM party_reactions pr
        JOIN users u ON pr.user_id = u.id
        WHERE pr.party_id = ? AND pr.timestamp_seconds >= ?
        ORDER BY pr.created_at DESC
        LIMIT 50
      `).all(party.id, since);
      res.json({ reactions });
    } catch (e) { next(e); }
  });

  router.post('/:code/reactions', authenticate, (req, res, next) => {
    try {
      const { code } = req.params;
      const { emoji, timestamp_seconds } = req.body;
      if (!emoji || emoji.length > 8) return res.status(400).json({ error: 'Invalid emoji' });
      const party = db.prepare('SELECT id FROM parties WHERE code = ? OR id = ?').get(code.toUpperCase(), code);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      db.prepare('INSERT INTO party_reactions (party_id, user_id, emoji, timestamp_seconds) VALUES (?, ?, ?, ?)')
        .run(party.id, req.user.id, emoji, timestamp_seconds || 0);
      broadcast(party.id, { type: 'reaction', username: req.user.username, emoji, timestamp_seconds: timestamp_seconds || 0 });
      res.status(201).json({ success: true });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = partiesRoutes;
