const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, adminOnly, optionalAuth } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

function contentRoutes(db) {
  const router = express.Router();

  router.get('/', optionalAuth, (req, res) => {
    const { genre, type, search, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT c.*, 0 as is_favorite FROM content c';
    let params = [];
    const conditions = [];

    if (req.user) {
      sql = `SELECT c.*, CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite FROM content c LEFT JOIN favorites f ON c.id = f.content_id AND f.user_id = ?`;
      params.push(req.user.id);
    }

    if (genre) { conditions.push('c.genre = ?'); params.push(genre); }
    if (type) { conditions.push('c.type = ?'); params.push(type); }
    if (search) { conditions.push('(c.title LIKE ? OR c.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const items = db.prepare(sql).all(...params);
    const countSql = 'SELECT COUNT(*) as total FROM content' + (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '');
    const { total } = db.prepare(countSql).get(...params.slice(0, -2)) || { total: 0 };

    const genres = db.prepare('SELECT DISTINCT genre FROM content WHERE genre IS NOT NULL').all().map(g => g.genre);
    res.json({ items, total, page: Number(page), genres });
  });

  router.get('/:id', optionalAuth, (req, res) => {
    const sql = req.user
      ? `SELECT c.*, CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite FROM content c LEFT JOIN favorites f ON c.id = f.content_id AND f.user_id = ? WHERE c.id = ?`
      : 'SELECT c.*, 0 as is_favorite FROM content c WHERE c.id = ?';
    const params = req.user ? [req.user.id, req.params.id] : [req.params.id];
    const item = db.prepare(sql).get(...params);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.type === 'show') {
      item.episodes = db.prepare('SELECT * FROM episodes WHERE show_id = ? ORDER BY season_number, episode_number').all(item.id);
    }
    res.json(item);
  });

  router.post('/', authenticate, adminOnly, (req, res) => {
    const { title, description, genre, release_year, type } = req.body;
    if (!title || !type) return res.status(400).json({ error: 'Title and type required' });
    const stmt = db.prepare('INSERT INTO content (title, description, genre, release_year, type, created_by) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(title, description || '', genre || null, release_year || null, type, req.user.id);
    res.json({ id: result.lastInsertRowid, ...req.body });
  });

  router.put('/:id', authenticate, adminOnly, (req, res) => {
    const { title, description, genre, release_year, type, poster_url, hls_path, duration_seconds } = req.body;
    const fields = []; const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (genre !== undefined) { fields.push('genre = ?'); params.push(genre); }
    if (release_year !== undefined) { fields.push('release_year = ?'); params.push(release_year); }
    if (type !== undefined) { fields.push('type = ?'); params.push(type); }
    if (poster_url !== undefined) { fields.push('poster_url = ?'); params.push(poster_url); }
    if (hls_path !== undefined) { fields.push('hls_path = ?'); params.push(hls_path); }
    if (duration_seconds !== undefined) { fields.push('duration_seconds = ?'); params.push(duration_seconds); }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.prepare(`UPDATE content SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  });

  router.delete('/:id', authenticate, adminOnly, (req, res) => {
    db.prepare('DELETE FROM content WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  router.post('/:id/favorite', authenticate, (req, res) => {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, content_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    res.json({ success: true });
  });

  router.delete('/:id/favorite', authenticate, (req, res) => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND content_id = ?').run(req.user.id, req.params.id);
    res.json({ success: true });
  });

  router.post('/:id/progress', authenticate, (req, res) => {
    const { progress_seconds, episode_id, completed } = req.body;
    db.prepare(`INSERT INTO watch_history (user_id, content_id, episode_id, progress_seconds, completed)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, content_id, episode_id)
      DO UPDATE SET progress_seconds = ?, completed = ?, watched_at = CURRENT_TIMESTAMP`)
      .run(req.user.id, req.params.id, episode_id || null, progress_seconds || 0, completed || 0, progress_seconds || 0, completed || 0);
    res.json({ success: true });
  });

  router.get('/:id/continue', authenticate, (req, res) => {
    const history = db.prepare('SELECT * FROM watch_history WHERE user_id = ? AND content_id = ? ORDER BY watched_at DESC LIMIT 1').get(req.user.id, req.params.id);
    res.json(history || { progress_seconds: 0 });
  });

  return router;
}

module.exports = contentRoutes;
