const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateToken, setTokenCookie, clearTokenCookie } = require('../middleware/auth');
const { ApiError } = require('../middleware/errors');

const JWT_SECRET = process.env.JWT_SECRET;

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function authRoutes(db) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        throw new ApiError(400, 'Username, email, and password required');
      }
      if (username.length < 2 || username.length > 50) {
        throw new ApiError(400, 'Username must be 2-50 characters');
      }
      if (!validateEmail(email)) {
        throw new ApiError(400, 'Invalid email format');
      }
      if (password.length < 6) {
        throw new ApiError(400, 'Password must be at least 6 characters');
      }

      const hash = await bcrypt.hash(password, 10);
      // 5 peacock credits as welcome bonus
      const result = db.prepare('INSERT INTO users (username, email, password, peacock_credits) VALUES (?, ?, ?, 5)').run(username, email, hash);
      // Unlock welcome achievement
      db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_key) VALUES (?, ?)').run(result.lastInsertRowid, 'welcome');

      const token = generateToken({ id: result.lastInsertRowid, username, is_admin: 0 });
      setTokenCookie(res, token);

      const user = db.prepare('SELECT id, username, email, is_admin, bio, favorite_genre, peacock_credits, streak_days, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ user });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return next(new ApiError(409, 'Username or email already taken'));
      }
      next(e);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        throw new ApiError(400, 'Email and password required');
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        throw new ApiError(401, 'Invalid email or password');
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        throw new ApiError(401, 'Invalid email or password');
      }

      const token = generateToken(user);
      setTokenCookie(res, token);

      const fullUser = db.prepare('SELECT id, username, email, is_admin, bio, favorite_genre, peacock_credits, streak_days, created_at FROM users WHERE id = ?').get(user.id);
      res.json({ user: fullUser });
    } catch (e) {
      next(e);
    }
  });

  router.post('/logout', (req, res) => {
    clearTokenCookie(res);
    res.json({ success: true });
  });

  router.get('/me', (req, res, next) => {
    try {
      const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1] : null);
      if (!token) {
        throw new ApiError(401, 'Not authenticated');
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, username, email, is_admin, bio, favorite_genre, peacock_credits, streak_days, last_watch_date, theme, pfp_skin, created_at FROM users WHERE id = ?').get(decoded.id);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }
      // Get achievement count
      const achievementCount = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE user_id = ?').get(user.id).c;
      const watchCount = db.prepare('SELECT COUNT(*) as c FROM watch_history WHERE user_id = ?').get(user.id).c;
      const favCount = db.prepare('SELECT COUNT(*) as c FROM favorites WHERE user_id = ?').get(user.id).c;
      // Get subscription info
      const sub = db.prepare('SELECT plan_id, status, current_period_end, canceled_at FROM subscriptions WHERE user_id = ?').get(user.id);
      const subscription = sub && ['active', 'trialing', 'past_due'].includes(sub.status)
        ? { plan: sub.plan_id, status: sub.status, current_period_end: sub.current_period_end, canceled_at: sub.canceled_at }
        : { plan: 'free', status: 'inactive', current_period_end: null, canceled_at: null };
      res.json({ ...user, achievement_count: achievementCount, watch_count: watchCount, fav_count: favCount, subscription });
    } catch (e) {
      if (e instanceof ApiError) return next(e);
      next(new ApiError(401, 'Invalid or expired token'));
    }
  });

  // Update profile
  router.put('/me', (req, res, next) => {
    try {
      const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1] : null);
      if (!token) {
        throw new ApiError(401, 'Not authenticated');
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      const { bio, favorite_genre } = req.body;
      if (bio != null) {
        if (typeof bio !== 'string' || bio.length > 200) throw new ApiError(400, 'Bio too long (max 200)');
        db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, decoded.id);
      }
      if (favorite_genre != null) {
        if (typeof favorite_genre !== 'string' || favorite_genre.length > 50) throw new ApiError(400, 'Invalid favorite genre');
        db.prepare('UPDATE users SET favorite_genre = ? WHERE id = ?').run(favorite_genre, decoded.id);
      }
      const user = db.prepare('SELECT id, username, email, is_admin, bio, favorite_genre, peacock_credits, streak_days, created_at FROM users WHERE id = ?').get(decoded.id);
      res.json({ user });
    } catch (e) {
      if (e instanceof ApiError) return next(e);
      next(new ApiError(401, 'Invalid token'));
    }
  });

  // Get user achievements
  router.get('/achievements', (req, res, next) => {
    try {
      const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1] : null);
      if (!token) return next(new ApiError(401, 'Not authenticated'));
      const decoded = jwt.verify(token, JWT_SECRET);
      const achievements = db.prepare('SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC').all(decoded.id);
      res.json({ achievements });
    } catch (e) {
      if (e instanceof ApiError) return next(e);
      next(new ApiError(401, 'Invalid token'));
    }
  });

  return router;
}

module.exports = authRoutes;
