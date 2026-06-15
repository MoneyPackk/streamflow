const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initDB } = require('../db/init');
const authRoutes = require('../routes/auth');
const contentRoutes = require('../routes/content');
const uploadRoutes = require('../routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;
const db = initDB();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// API routes
app.use('/api/auth', authRoutes(db));
app.use('/api/content', contentRoutes(db));
app.use('/api/upload', uploadRoutes(db));

// Stream HLS segments
app.use('/uploads', express.static(path.join(__dirname, '..', '..', 'public', 'uploads')));

// SPA fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Streaming platform running on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
