require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB } = require('../db/init');
const { errorHandler } = require('../middleware/errors');
const { initWebSocket } = require('../lib/websocket');
const authRoutes = require('../routes/auth');
const contentRoutes = require('../routes/content');
const tmdbRoutes = require('../routes/tmdb');
const streamRoutes = require('../routes/stream');
const { embedRoutes } = require('../routes/embed');
const socialRoutes = require('../routes/social');
const partiesRoutes = require('../routes/parties');
const settingsRoutes = require('../routes/settings');
const searchRoutes = require('../routes/search');
const chatRoutes = require('../routes/chat');
const moviesRoutes = require('../routes/movies');
const subscriptionRoutes = require('../routes/subscription');
const { webhookRouter } = require('../routes/subscription');

const app = express();
const PORT = process.env.PORT || 5000;
const db = initDB();
app.locals.db = db;
const animationDirectorRoutes = require('../routes/animation-director');

// Trust nginx proxy so rate limiter sees real client IPs
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
app.use(cors({
  origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS.split(','),
  credentials: true,
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stripe webhook must come BEFORE express.json() (needs raw body)
app.use('/api/subscriptions/webhook', webhookRouter(db));

app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(cookieParser());
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Static assets with long cache for fingerprinted files
app.use(express.static(path.join(__dirname, '..', '..', 'public'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// API routes
app.use('/api/auth', authRoutes(db));
app.use('/api/content', contentRoutes(db));
app.use('/api/tmdb', tmdbRoutes());
app.use('/api/stream', streamRoutes());
app.use('/api/embed', embedRoutes());
app.use('/api/social', socialRoutes(db));
app.use('/api/settings', settingsRoutes(db));
app.use('/api/search', searchRoutes());
app.use('/api/chat', chatRoutes());
app.use('/api/animation-director', animationDirectorRoutes);
app.use('/api/subscriptions', subscriptionRoutes(db));
app.use('/api/movies', moviesRoutes());
app.use('/api/genres', ((() => {
  const router = express.Router();
  const cache = new Map();
  router.get('/', async (req, res) => {
    const type = req.query.type || 'movie';
    const cached = cache.get(type);
    if (cached && Date.now() - cached.ts < 3600000) return res.json(cached.data);
    try {
      const axios = require('axios');
      const { data } = await axios.get(`https://api.themoviedb.org/3/genre/${type}/list`, {
        params: { language: 'en-US' },
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      });
      cache.set(type, { data: data.genres || [], ts: Date.now() });
      res.json(data.genres || []);
    } catch { res.json([]); }
  });
  return router;
})()));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Streamora',
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  });
});

const server = http.createServer(app);
const { broadcast } = initWebSocket(server);

app.use('/api/parties', partiesRoutes(db, broadcast));

// SPA fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Centralized error handler (must be last)
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Streamora running on http://localhost:${PORT}`);
  console.log(`TMDB proxy: http://localhost:${PORT}/api/tmdb`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
