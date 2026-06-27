const express = require('express');
const { authenticate, optionalAuth } = require('../middleware/auth');

function contentRoutes(db) {
  const router = express.Router();

  // Content list — placeholder, frontend uses /api/tmdb
  router.get('/', optionalAuth, (req, res) => {
    const { search } = req.query;
    if (search) return res.json({ items: [], total: 0, page: 1, genres: [] });
    res.json({ items: [], total: 0, page: 1, genres: [] });
  });

  // Get user metadata for tmdb_id (favorite + progress)
  router.get('/:tmdb_id', optionalAuth, (req, res) => {
    const { tmdb_id } = req.params;
    if (!/^\d+$/.test(tmdb_id)) {
      return res.status(400).json({ error: 'Invalid tmdb_id' });
    }
    if (req.user) {
      const fav = db.prepare('SELECT * FROM favorites WHERE tmdb_id = ? AND user_id = ?').get(tmdb_id, req.user.id);
      const hist = db.prepare('SELECT * FROM watch_history WHERE tmdb_id = ? AND user_id = ? ORDER BY watched_at DESC LIMIT 1').get(tmdb_id, req.user.id);
      return res.json({ is_favorite: fav ? 1 : 0, progress: hist || null });
    }
    res.json({ is_favorite: 0, progress: null });
  });

  // Favorites
  router.post('/:tmdb_id/favorite', authenticate, (req, res) => {
    const { tmdb_id } = req.params;
    if (!/^\d+$/.test(tmdb_id)) {
      return res.status(400).json({ error: 'Invalid tmdb_id' });
    }
    const { title, poster_url, type, release_year } = req.body;
    const existing = db.prepare('SELECT id FROM favorites WHERE tmdb_id = ? AND user_id = ?').get(tmdb_id, req.user.id);
    if (existing) return res.json({ success: true });

    db.prepare(
      `INSERT INTO favorites (user_id, tmdb_id, media_type, title, poster_url, release_year)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, tmdb_id, type || 'movie', title || '', poster_url || null, release_year || null);
    res.status(201).json({ success: true });
  });

  router.delete('/:tmdb_id/favorite', authenticate, (req, res) => {
    const { tmdb_id } = req.params;
    if (!/^\d+$/.test(tmdb_id)) {
      return res.status(400).json({ error: 'Invalid tmdb_id' });
    }
    db.prepare('DELETE FROM favorites WHERE tmdb_id = ? AND user_id = ?').run(tmdb_id, req.user.id);
    res.json({ success: true });
  });

  // Achievement system: define all unlockable achievements
  const ACHIEVEMENTS = {
    welcome: { name: 'Welcome to the Flock', icon: '🦚', desc: 'Joined PeacocksStreams' },
    first_watch: { name: 'First Blood', icon: '🎬', desc: 'Watched your first title' },
    binge_5: { name: 'Binger', icon: '🍿', desc: 'Watched 5 different titles' },
    binge_25: { name: 'Beast Mode', icon: '⚡', desc: 'Watched 25 different titles' },
    binge_100: { name: 'Legendary Peacock', icon: '👑', desc: 'Watched 100 different titles' },
    binge_500: { name: 'Streaming God', icon: '🌌', desc: 'Watched 500 different titles' },
    streak_3: { name: '3-Day Streak', icon: '🔥', desc: 'Watched 3 days in a row' },
    streak_7: { name: 'Weekly Warrior', icon: '💪', desc: 'Watched 7 days in a row' },
    streak_30: { name: 'Monthly Master', icon: '🏆', desc: 'Watched 30 days in a row' },
    streak_100: { name: 'Centurion', icon: '💯', desc: 'Watched 100 days in a row' },
    collector_10: { name: 'Collector', icon: '❤️', desc: 'Added 10 favorites' },
    collector_50: { name: 'Hoarder', icon: '💎', desc: 'Added 50 favorites' },
    watchlist_5: { name: 'Planner', icon: '📋', desc: 'Added 5 to your watchlist' },
    critic: { name: 'Top Critic', icon: '⭐', desc: 'Rated 5 titles' },
    critic_25: { name: 'Roger Ebert', icon: '🎞️', desc: 'Rated 25 titles' },
    commenter: { name: 'Commentator', icon: '💬', desc: 'Left your first comment' },
    social_butterfly: { name: 'Social Peacock', icon: '🦋', desc: 'Joined a watch party' },
    night_owl: { name: 'Night Owl', icon: '🦉', desc: 'Watched after midnight' },
    early_bird: { name: 'Early Bird', icon: '🐦', desc: 'Watched before 6am' },
    completionist: { name: 'Completionist', icon: '✅', desc: 'Watched a full season' },
    spend_10: { name: 'Big Spender', icon: '💸', desc: 'Spent 10 Peacock Credits' },
  };

  function unlockAchievement(userId, key) {
    if (!ACHIEVEMENTS[key]) return null;
    const result = db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)').run(userId, key);
    if (result.changes > 0) {
      // Award 1 peacock credit per achievement
      db.prepare('UPDATE users SET peacock_credits = peacock_credits + 1 WHERE id = ?').run(userId);
      return ACHIEVEMENTS[key];
    }
    return null;
  }

  // Watch progress — use 0 for movies (no episode) since SQLite UNIQUE treats NULLs as distinct
  router.post('/:tmdb_id/progress', authenticate, (req, res) => {
    try {
      const { tmdb_id } = req.params;
      if (!/^\d+$/.test(tmdb_id)) {
        return res.status(400).json({ error: 'Invalid tmdb_id' });
      }
      const { progress_seconds, runtime_seconds, completed, season_number, episode_number, title, poster_url, media_type, vote_average } = req.body;
      const epNum = episode_number || 0; // 0 for movies, real episode for TV

      db.prepare(
        `INSERT INTO watch_history (user_id, tmdb_id, media_type, season_number, episode_number, title, poster_url, progress_seconds, runtime_seconds, completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, tmdb_id, episode_number)
         DO UPDATE SET progress_seconds = excluded.progress_seconds, runtime_seconds = excluded.runtime_seconds, completed = excluded.completed, watched_at = CURRENT_TIMESTAMP`
      ).run(
        req.user.id, tmdb_id, media_type || 'movie',
        season_number || null, epNum,
        title || null, poster_url || null,
        progress_seconds || 0, runtime_seconds || 0, completed || 0
      );

      // Update streak (only on completed)
      const unlocked = [];
      if (completed) {
        const today = new Date().toISOString().split('T')[0];
        const user = db.prepare('SELECT streak_days, last_watch_date FROM users WHERE id = ?').get(req.user.id);
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let newStreak = user.streak_days || 0;
        if (user.last_watch_date !== yesterday && user.last_watch_date !== today) {
          newStreak = 1;
        } else if (user.last_watch_date === yesterday) {
          newStreak += 1;
        }
        db.prepare('UPDATE users SET streak_days = ?, last_watch_date = ? WHERE id = ?').run(newStreak, today, req.user.id);

        const a1 = unlockAchievement(req.user.id, 'first_watch');
        if (a1) unlocked.push(a1);

        const totalWatched = db.prepare('SELECT COUNT(DISTINCT tmdb_id) as c FROM watch_history WHERE user_id = ?').get(req.user.id).c;
        if (totalWatched >= 5) { const a = unlockAchievement(req.user.id, 'binge_5'); if (a) unlocked.push(a); }
        if (totalWatched >= 25) { const a = unlockAchievement(req.user.id, 'binge_25'); if (a) unlocked.push(a); }
        if (totalWatched >= 100) { const a = unlockAchievement(req.user.id, 'binge_100'); if (a) unlocked.push(a); }
        if (newStreak >= 3) { const a = unlockAchievement(req.user.id, 'streak_3'); if (a) unlocked.push(a); }
        if (newStreak >= 7) { const a = unlockAchievement(req.user.id, 'streak_7'); if (a) unlocked.push(a); }
        if (newStreak >= 30) { const a = unlockAchievement(req.user.id, 'streak_30'); if (a) unlocked.push(a); }
        if (vote_average && vote_average >= 8.0) {
          const a = unlockAchievement(req.user.id, 'critic');
          if (a) unlocked.push(a);
        }
      }

      const favCount = db.prepare('SELECT COUNT(*) as c FROM favorites WHERE user_id = ?').get(req.user.id).c;
      if (favCount >= 10) { const a = unlockAchievement(req.user.id, 'collector_10'); if (a) unlocked.push(a); }
      if (favCount >= 50) { const a = unlockAchievement(req.user.id, 'collector_50'); if (a) unlocked.push(a); }

      res.json({ success: true, unlocked_achievements: unlocked });
    } catch (err) {
      console.error('Progress save error:', err.message);
      res.json({ success: true, unlocked_achievements: [] }); // Don't fail playback
    }
  });

  router.get('/achievements/list', (req, res) => {
    res.json(ACHIEVEMENTS);
  });

  router.get('/:tmdb_id/continue', authenticate, (req, res) => {
    const { tmdb_id } = req.params;
    if (!/^\d+$/.test(tmdb_id)) {
      return res.status(400).json({ error: 'Invalid tmdb_id' });
    }
    const history = db.prepare(
      'SELECT * FROM watch_history WHERE user_id = ? AND tmdb_id = ? ORDER BY watched_at DESC LIMIT 1'
    ).get(req.user.id, tmdb_id);
    res.json(history || { progress_seconds: 0 });
  });

  // List user's favorites (must be before /:tmdb_id routes)
  router.get('/favorites/list', authenticate, (req, res) => {
    const favs = db.prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
    res.json(favs);
  });

  router.get('/continue/list', authenticate, (req, res) => {
    const items = db.prepare(`
      SELECT tmdb_id, media_type, season_number, episode_number, title, poster_url,
             progress_seconds, runtime_seconds, completed, watched_at
      FROM watch_history
      WHERE user_id = ? AND completed = 0 AND progress_seconds > 60
      ORDER BY watched_at DESC
      LIMIT 24
    `).all(req.user.id);
    res.json({ items });
  });

  return router;
}

module.exports = contentRoutes;
