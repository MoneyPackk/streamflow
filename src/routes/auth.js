const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

function authRoutes(db) {
  const router = express.Router();

  router.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    try {
      const hash = bcrypt.hashSync(password, 10);
      const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
      const result = stmt.run(username, email, hash);
      const token = generateToken({ id: result.lastInsertRowid, username, is_admin: 0 });
      res.json({ token, user: { id: result.lastInsertRowid, username, email, is_admin: 0 } });
    } catch (e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username or email taken' });
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } });
  });

  router.get('/me', (req, res) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = require('jsonwebtoken').verify(header.split(' ')[1], require('../middleware/auth').JWT_SECRET);
      const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch { res.status(401).json({ error: 'Invalid token' }); }
  });

  return router;
}

module.exports = authRoutes;
