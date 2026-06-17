const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { generateRecommendations, getCached, setCache } = require('../lib/recommendationEngine');

// Ratings, comments, watchlist, notifications, recommendations
function socialRoutes(db) {
  const router = express.Router();

  // ─── RATINGS ───
  router.post('/ratings/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const { rating, review, media_type = 'movie' } = req.body;
      const r = parseInt(rating);
      if (!r || r < 1 || r > 10) return res.status(400).json({ error: 'Rating must be 1-10' });
      if (review && typeof review === 'string' && review.length > 1000) {
        return res.status(400).json({ error: 'Review too long (max 1000 chars)' });
      }
      const existing = db.prepare('SELECT id FROM ratings WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').get(req.user.id, tmdb_id, media_type);
      if (existing) {
        db.prepare('UPDATE ratings SET rating = ?, review = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?').run(r, review || '', existing.id);
      } else {
        db.prepare('INSERT INTO ratings (user_id, tmdb_id, media_type, rating, review) VALUES (?, ?, ?, ?, ?)').run(req.user.id, tmdb_id, media_type, r, review || '');
      }
      res.json({ success: true, rating: r });
    } catch (e) { next(e); }
  });

  router.get('/ratings/:tmdb_id', optionalAuth, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const media_type = req.query.type || 'movie';
      const myRating = req.user ? db.prepare('SELECT rating, review, created_at FROM ratings WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').get(req.user.id, tmdb_id, media_type) : null;
      const aggregate = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM ratings WHERE tmdb_id = ? AND media_type = ?').get(tmdb_id, media_type);
      res.json({
        my_rating: myRating || null,
        avg: aggregate.avg ? Math.round(aggregate.avg * 10) / 10 : null,
        count: aggregate.count,
      });
    } catch (e) { next(e); }
  });

  router.delete('/ratings/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const media_type = req.query.type || 'movie';
      db.prepare('DELETE FROM ratings WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(req.user.id, tmdb_id, media_type);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ─── COMMENTS ───
  router.get('/comments/:tmdb_id', optionalAuth, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const media_type = req.query.type || 'movie';
      const comments = db.prepare(`
        SELECT c.id, c.body, c.parent_id, c.likes_count, c.created_at,
               u.username, u.id as user_id, u.pfp_skin
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.tmdb_id = ? AND c.media_type = ?
        ORDER BY c.created_at DESC
        LIMIT 100
      `).all(tmdb_id, media_type);
      // Mark which the user liked
      if (req.user) {
        const likes = db.prepare('SELECT comment_id FROM comment_likes WHERE user_id = ?').all(req.user.id);
        const likedSet = new Set(likes.map(l => l.comment_id));
        comments.forEach(c => c.liked = likedSet.has(c.id));
      }
      res.json({ comments });
    } catch (e) { next(e); }
  });

  router.post('/comments/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const { body, parent_id, media_type = 'movie' } = req.body;
      if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Comment body required' });
      if (body.length > 2000) return res.status(400).json({ error: 'Comment too long' });
      const result = db.prepare(
        'INSERT INTO comments (user_id, tmdb_id, media_type, parent_id, body) VALUES (?, ?, ?, ?, ?)'
      ).run(req.user.id, tmdb_id, media_type, parent_id || null, body.trim());
      // Notify
      if (parent_id) {
        const parent = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(parent_id);
        if (parent && parent.user_id !== req.user.id) {
          db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)')
            .run(parent.user_id, 'reply', `${req.user.username} replied to your comment`, body.substring(0, 100), `?${media_type}=${tmdb_id}`);
        }
      }
      res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (e) { next(e); }
  });

  router.post('/comments/:id/like', authenticate, (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const existing = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(req.user.id, id);
      if (existing) {
        db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(req.user.id, id);
        db.prepare('UPDATE comments SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(id);
        res.json({ liked: false });
      } else {
        db.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)').run(req.user.id, id);
        db.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').run(id);
        res.json({ liked: true });
      }
    } catch (e) { next(e); }
  });

  // ─── WATCHLIST ───
  router.get('/watchlist', authenticate, (req, res, next) => {
    try {
      const items = db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
      res.json({ items });
    } catch (e) { next(e); }
  });

  router.post('/watchlist/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const { title, poster_url, media_type = 'movie', release_year, remind_at } = req.body;
      const existing = db.prepare('SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').get(req.user.id, tmdb_id, media_type);
      if (existing) {
        db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(req.user.id, tmdb_id, media_type);
        return res.json({ success: true, action: 'removed' });
      }
      db.prepare('INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_url, release_year, remind_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.id, tmdb_id, media_type, title || '', poster_url || null, release_year || null, remind_at || null);
      res.status(201).json({ success: true, action: 'added' });
    } catch (e) { next(e); }
  });

  router.delete('/watchlist/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const media_type = req.query.type || 'movie';
      db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(req.user.id, tmdb_id, media_type);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.get('/watchlist/check/:tmdb_id', authenticate, (req, res, next) => {
    try {
      const tmdb_id = parseInt(req.params.tmdb_id);
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid tmdb_id' });
      const media_type = req.query.type || 'movie';
      const exists = db.prepare('SELECT id FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').get(req.user.id, tmdb_id, media_type);
      res.json({ on_watchlist: !!exists });
    } catch (e) { next(e); }
  });

  // ─── NOTIFICATIONS ───
  router.get('/notifications', authenticate, (req, res, next) => {
    try {
      const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
      const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c;
      res.json({ notifications: notifs, unread });
    } catch (e) { next(e); }
  });

  router.post('/notifications/:id/read', authenticate, (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  router.post('/notifications/read-all', authenticate, (req, res, next) => {
    try {
      db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

  // ─── RECOMMENDATIONS (For You) — v2: three-tier ML engine ───
  router.get('/recommendations', authenticate, async (req, res, next) => {
    try {
      // Check cache first
      const cached = getCached(req.user.id);
      if (cached) return res.json(cached);

      const result = await generateRecommendations(db, req.user.id);
      setCache(req.user.id, result);
      res.json(result);
    } catch (e) {
      console.error('Recommendation error:', e.message);
      // Graceful fallback — return empty, frontend shows "rate a few to get started"
      res.json({ items: [], meta: { source: 'error', generation_ms: 0, coverage: 0 } });
    }
  });

  return router;
}

module.exports = socialRoutes;
