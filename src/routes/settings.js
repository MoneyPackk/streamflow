const express = require('express');
const { authenticate } = require('../middleware/auth');

const STORE = {
  themes: [
    { id: 'dark', name: 'Dark Peacock', cost: 0, description: 'Default dark theme' },
    { id: 'midnight', name: 'Midnight', cost: 10, description: 'Deeper blacks, neon purples' },
    { id: 'sunset', name: 'Sunset', cost: 15, description: 'Warm oranges and pinks' },
    { id: 'forest', name: 'Forest', cost: 12, description: 'Deep greens and earth tones' },
    { id: 'light', name: 'Light', cost: 20, description: 'Bright and clean daytime mode' },
  ],
  pfp_skins: [
    { id: 'default', name: 'Default', cost: 0, description: 'Gangster peacock' },
    { id: 'gold', name: 'Gold', cost: 25, description: 'Premium gold-plated peacock' },
    { id: 'neon', name: 'Neon', cost: 20, description: 'Glow in the dark' },
    { id: 'fire', name: 'Fire', cost: 30, description: 'Burning peacock' },
    { id: 'diamond', name: 'Diamond', cost: 50, description: 'Crystal clear' },
  ],
  perks: [
    { id: 'quality_4k', name: '4K Beast Mode', cost: 5, description: 'Unlock 4K for one session' },
    { id: 'no_watermark', name: 'No Watermark', cost: 3, description: 'Hide the peacock watermark for 24h' },
    { id: 'ai_summary', name: 'AI Movie Recap', cost: 5, description: 'Get an AI summary of any movie' },
    { id: 'ad_free_week', name: 'Ad-Free Boost', cost: 8, description: '7 days of even fewer interruptions' },
  ],
};

function settingsRoutes(db) {
  const router = express.Router();

  router.get('/store', (_req, res) => {
    res.json(STORE);
  });

  // Spend credits on a perk/skin/theme
  router.post('/spend', authenticate, (req, res, next) => {
    try {
      const { type, id } = req.body;
      const items = type === 'theme' ? STORE.themes : type === 'pfp_skin' ? STORE.pfp_skins : STORE.perks;
      const item = items.find(i => i.id === id);
      if (!item) return res.status(400).json({ error: 'Item not found' });
      const user = db.prepare('SELECT peacock_credits FROM users WHERE id = ?').get(req.user.id);
      if (user.peacock_credits < item.cost) {
        return res.status(400).json({ error: 'Not enough Peacock Credits' });
      }
      db.prepare('UPDATE users SET peacock_credits = peacock_credits - ? WHERE id = ?').run(item.cost, req.user.id);
      db.prepare('INSERT INTO credit_log (user_id, amount, reason) VALUES (?, ?, ?)').run(req.user.id, -item.cost, `Spent on ${item.name}`);
      if (type === 'theme') {
        db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(id, req.user.id);
      } else if (type === 'pfp_skin') {
        db.prepare('UPDATE users SET pfp_skin = ? WHERE id = ?').run(id, req.user.id);
      } else if (type === 'perk') {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        if (id === 'no_watermark') {
          res.cookie('perk_no_watermark', '1', { maxAge: 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
        } else if (id === 'quality_4k') {
          res.cookie('perk_quality_4k', '1', { maxAge: 4 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
        }
        void expires;
      }
      const newCredits = db.prepare('SELECT peacock_credits FROM users WHERE id = ?').get(req.user.id).peacock_credits;
      res.json({ success: true, new_credits: newCredits, applied: true, perk: type === 'perk' ? id : undefined });
    } catch (e) { next(e); }
  });

  // Personal stats / activity
  router.get('/stats', authenticate, (req, res, next) => {
    try {
      const totalWatched = db.prepare(`
        SELECT COUNT(DISTINCT tmdb_id) as unique_titles,
               COUNT(*) as total_plays,
               COALESCE(SUM(progress_seconds), 0) as total_seconds
        FROM watch_history
        WHERE user_id = ? AND completed = 1
      `).get(req.user.id);
      const favCount = db.prepare('SELECT COUNT(*) as c FROM favorites WHERE user_id = ?').get(req.user.id).c;
      const ratingCount = db.prepare('SELECT COUNT(*) as c, AVG(rating) as avg FROM ratings WHERE user_id = ?').get(req.user.id);
      const achievementCount = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE user_id = ?').get(req.user.id).c;
      const commentCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE user_id = ?').get(req.user.id).c;

      // Recent activity (last 7 days of watch history)
      const recentActivity = db.prepare(`
        SELECT title, media_type, watched_at, tmdb_id, season_number, episode_number
        FROM watch_history
        WHERE user_id = ? AND watched_at >= datetime('now', '-7 days')
        ORDER BY watched_at DESC
        LIMIT 10
      `).all(req.user.id);

      // Time watched this week vs last week
      const thisWeek = db.prepare(`
        SELECT COALESCE(SUM(progress_seconds), 0) as s
        FROM watch_history
        WHERE user_id = ? AND watched_at >= datetime('now', '-7 days')
      `).get(req.user.id).s;
      const lastWeek = db.prepare(`
        SELECT COALESCE(SUM(progress_seconds), 0) as s
        FROM watch_history
        WHERE user_id = ? AND watched_at >= datetime('now', '-14 days') AND watched_at < datetime('now', '-7 days')
      `).get(req.user.id).s;

      // Top genres from ratings
      const topGenres = db.prepare(`
        SELECT r.rating, r.tmdb_id
        FROM ratings r
        WHERE r.user_id = ?
      `).all(req.user.id);

      // Activity feed: recent achievements + watch milestones
      const milestones = db.prepare(`
        (SELECT 'achievement' as type, achievement_key as title, unlocked_at as at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC LIMIT 5)
        UNION ALL
        (SELECT 'watch' as type, title as title, watched_at as at FROM watch_history WHERE user_id = ? AND completed = 1 ORDER BY watched_at DESC LIMIT 10)
        ORDER BY at DESC
        LIMIT 15
      `).all(req.user.id, req.user.id);

      res.json({
        total_unique_titles: totalWatched.unique_titles || 0,
        total_plays: totalWatched.total_plays || 0,
        total_minutes: Math.round((totalWatched.total_seconds || 0) / 60),
        this_week_minutes: Math.round(thisWeek / 60),
        last_week_minutes: Math.round(lastWeek / 60),
        favorites: favCount,
        ratings_given: ratingCount.c || 0,
        avg_rating: ratingCount.avg ? Math.round(ratingCount.avg * 10) / 10 : null,
        achievements: achievementCount,
        comments: commentCount,
        recent_activity: recentActivity,
        milestones,
      });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = settingsRoutes;
