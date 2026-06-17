const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'streaming.db');

function initDB() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      bio TEXT DEFAULT '',
      favorite_genre TEXT DEFAULT '',
      peacock_credits INTEGER DEFAULT 5,
      streak_days INTEGER DEFAULT 0,
      last_watch_date TEXT DEFAULT '',
      theme TEXT DEFAULT 'dark',
      pfp_skin TEXT DEFAULT 'default',
      quality_pref TEXT DEFAULT '1080p',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      title TEXT,
      poster_url TEXT,
      release_year INTEGER,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tmdb_id)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      title TEXT,
      poster_url TEXT,
      release_year INTEGER,
      remind_at TEXT DEFAULT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tmdb_id)
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      season_number INTEGER,
      episode_number INTEGER DEFAULT 0,
      title TEXT,
      poster_url TEXT,
      progress_seconds REAL DEFAULT 0,
      runtime_seconds REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tmdb_id, episode_number)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      achievement_key TEXT NOT NULL,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
      review TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tmdb_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comment_likes (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, comment_id)
    );

    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT DEFAULT 'movie',
      season_number INTEGER,
      episode_number INTEGER,
      current_time_seconds REAL DEFAULT 0,
      is_playing INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS party_members (
      party_id INTEGER REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (party_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS party_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      party_id INTEGER REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS party_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      party_id INTEGER REFERENCES parties(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      timestamp_seconds REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      link TEXT DEFAULT '',
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations for existing users table
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('bio')) db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
  if (!userCols.includes('favorite_genre')) db.exec("ALTER TABLE users ADD COLUMN favorite_genre TEXT DEFAULT ''");
  if (!userCols.includes('peacock_credits')) db.exec("ALTER TABLE users ADD COLUMN peacock_credits INTEGER DEFAULT 5");
  if (!userCols.includes('streak_days')) db.exec("ALTER TABLE users ADD COLUMN streak_days INTEGER DEFAULT 0");
  if (!userCols.includes('last_watch_date')) db.exec("ALTER TABLE users ADD COLUMN last_watch_date TEXT DEFAULT ''");
  if (!userCols.includes('theme')) db.exec("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'");
  if (!userCols.includes('pfp_skin')) db.exec("ALTER TABLE users ADD COLUMN pfp_skin TEXT DEFAULT 'default'");
  if (!userCols.includes('quality_pref')) db.exec("ALTER TABLE users ADD COLUMN quality_pref TEXT DEFAULT '1080p'");
  db.exec("UPDATE users SET peacock_credits = 5 WHERE peacock_credits IS NULL OR peacock_credits = 0");

  // Watch history: add runtime_seconds if missing
  const whCols = db.prepare("PRAGMA table_info(watch_history)").all().map(c => c.name);
  if (!whCols.includes('runtime_seconds')) db.exec("ALTER TABLE watch_history ADD COLUMN runtime_seconds REAL DEFAULT 0");

  return db;
}

module.exports = { initDB, DB_PATH };
