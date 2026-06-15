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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      release_year INTEGER,
      type TEXT CHECK(type IN ('movie','show')) NOT NULL,
      poster_url TEXT,
      hls_path TEXT,
      duration_seconds INTEGER,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL,
      episode_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      hls_path TEXT,
      duration_seconds INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
      progress_seconds REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, content_id, episode_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content_id INTEGER REFERENCES content(id) ON DELETE CASCADE,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, content_id)
    );
  `);

  return db;
}

module.exports = { initDB, DB_PATH };
