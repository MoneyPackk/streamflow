const axios = require('axios');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_TOKEN = process.env.TMDB_API_KEY;
const CACHE_TTL = 5 * 60 * 1000; // 5 min recommendation cache

const recCache = new Map();

function cacheKey(userId) { return `rec:${userId}`; }
function getCached(userId) {
  const e = recCache.get(cacheKey(userId));
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}
function setCache(userId, data) {
  recCache.set(cacheKey(userId), { ts: Date.now(), data });
}

// Clean old cache entries every 15 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of recCache.entries()) {
    if (now - v.ts > CACHE_TTL * 4) recCache.delete(k);
  }
}, 15 * 60 * 1000).unref();

function mapMovie(m) {
  return {
    tmdb_id: m.id,
    title: m.title,
    type: 'movie',
    poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    release_year: m.release_date ? parseInt(m.release_date) : null,
    vote_average: m.vote_average,
    popularity: m.popularity,
  };
}

function mapShow(s) {
  return {
    tmdb_id: s.id,
    title: s.name,
    type: 'tv',
    poster_url: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
    release_year: s.first_air_date ? parseInt(s.first_air_date) : null,
    vote_average: s.vote_average,
    popularity: s.popularity,
  };
}

async function fetchTMDB(path, params = {}) {
  const url = `${TMDB_BASE}${path}`;
  const { data } = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
    timeout: 8000,
  });
  return data;
}

/**
 * Production Recommendation Engine — PeacocksStreams ForYou v2
 *
 * Data contract:
 *   Input:  user_id (from req.user), ratings[], watch_history[], favorites[]
 *   Output: { items: Item[], meta: { source, generation_ms, coverage } }
 *
 * Architecture: Three-tier fallback
 *   Tier 1: User-collaborative (users with similar rating vectors)
 *   Tier 2: Content-similar (TMDB similar for top engaged items)
 *   Tier 3: Popularity fallback (top rated English content, excludes seen)
 *
 * Item score formula:
 *   similarity_weight * vote_average + popularity_boost + freshness_boost
 */

async function getUserCollaborative(db, userId, engaged, idScores) {
  // Find users who rated the same items (simple user-user CF)
  const myRatings = db.prepare('SELECT tmdb_id, rating FROM ratings WHERE user_id = ? AND rating >= 6').all(userId);
  if (myRatings.length < 3) return []; // Not enough data for collaborative

  const myIds = new Set(myRatings.map(r => r.tmdb_id));
  const myVectors = {};
  myRatings.forEach(r => { myVectors[r.tmdb_id] = r.rating; });

  // Find neighbor users who rated at least 3 of the same items
  const neighborIds = db.prepare(`
    SELECT r1.user_id, COUNT(DISTINCT r1.tmdb_id) as overlap
    FROM ratings r1
    WHERE r1.tmdb_id IN (${myRatings.map(() => '?').join(',')})
    AND r1.user_id != ?
    AND r1.rating >= 6
    GROUP BY r1.user_id
    HAVING overlap >= 3
    ORDER BY overlap DESC
    LIMIT 10
  `).all(...myIds, userId);

  if (!neighborIds.length) return [];

  // Get what neighbors rated highly but user hasn't seen
  const neighborIdList = neighborIds.map(n => n.user_id);
  const neighborRecs = db.prepare(`
    SELECT r.tmdb_id, r.media_type, AVG(r.rating) as avg_rating, COUNT(*) as raters
    FROM ratings r
    WHERE r.user_id IN (${neighborIdList.map(() => '?').join(',')})
    AND r.tmdb_id NOT IN (${myRatings.map(() => '?').join(',')})
    AND r.rating >= 6
    GROUP BY r.tmdb_id
    HAVING raters >= 2
    ORDER BY avg_rating DESC
    LIMIT 20
  `).all(...neighborIdList, ...myIds);

  // Enrich with TMDB data
  const items = [];
  for (const rec of neighborRecs) {
    if (engaged.has(rec.tmdb_id)) continue;
    try {
      const endpoint = rec.media_type === 'tv' ? '/tv' : '/movie';
      const data = await fetchTMDB(`/${endpoint}/${rec.tmdb_id}`);
      const item = rec.media_type === 'tv' ? mapShow(data) : mapMovie(data);
      item.score = rec.avg_rating * 1.2; // Boost collaborative results
      item.source = 'collaborative';
      items.push(item);
    } catch {}
  }
  return items;
}

async function getContentSimilar(db, userId, engaged, idScores) {
  const topEngaged = Object.entries(idScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Also get the user's watched items with their media_types
  const history = db.prepare('SELECT DISTINCT tmdb_id, media_type FROM watch_history WHERE user_id = ? AND completed = 1').all(userId);
  const mediaTypeMap = {};
  history.forEach(h => { mediaTypeMap[h.tmdb_id] = h.media_type; });

  const recommendations = new Map();

  for (const [idStr, score] of topEngaged) {
    const tmdbId = parseInt(idStr);
    const mediaType = mediaTypeMap[tmdbId] || 'movie';

    try {
      const endpoint = mediaType === 'tv' ? '/tv' : '/movie';
      const data = await fetchTMDB(`/${endpoint}/${tmdbId}`, { append_to_response: 'similar' });

      if (data.similar?.results) {
        data.similar.results.slice(0, 10).forEach(sim => {
          if (!engaged.has(sim.id) && (sim.original_language === 'en' || sim.original_language === undefined)) {
            const item = mediaType === 'tv' ? mapShow(sim) : mapMovie(sim);
            const existing = recommendations.get(sim.id);
            if (!existing) {
              item.score = score * (sim.vote_average ? sim.vote_average / 10 : 0.5);
              item.source = 'content-similar';
              recommendations.set(sim.id, item);
            } else {
              existing.score += score * (sim.vote_average ? sim.vote_average / 10 : 0.2);
            }
          }
        });
      }
    } catch {}
  }

  return Array.from(recommendations.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

async function getPopularityFallback(engaged) {
  try {
    const [movies, shows] = await Promise.all([
      fetchTMDB('/movie/top_rated', { region: 'US', with_original_language: 'en', 'vote_count.gte': 50, page: 1 }),
      fetchTMDB('/tv/top_rated', { with_original_language: 'en', 'vote_count.gte': 50, page: 1 }),
    ]);

    const items = [];
    movies.results?.forEach(m => {
      if (!engaged.has(m.id)) items.push({ ...mapMovie(m), score: (m.vote_average || 5) * 0.8, source: 'popularity' });
    });
    shows.results?.forEach(s => {
      if (!engaged.has(s.id)) items.push({ ...mapShow(s), score: (s.vote_average || 5) * 0.8, source: 'popularity' });
    });

    return items.sort((a, b) => b.score - a.score).slice(0, 30);
  } catch {
    return [];
  }
}

async function generateRecommendations(db, userId) {
  const startTime = Date.now();

  // Fetch user engagement data
  const ratings = db.prepare('SELECT tmdb_id, media_type, rating FROM ratings WHERE user_id = ? ORDER BY rating DESC LIMIT 30').all(userId);
  const watchHistory = db.prepare(`
    SELECT tmdb_id, media_type, COUNT(*) as plays
    FROM watch_history WHERE user_id = ? AND completed = 1
    GROUP BY tmdb_id ORDER BY watched_at DESC LIMIT 30
  `).all(userId);
  const favorites = db.prepare('SELECT tmdb_id, media_type FROM favorites WHERE user_id = ? LIMIT 30').all(userId);

  // Build engagement profile
  const engaged = new Set();
  const idScores = {};
  ratings.forEach(r => { engaged.add(r.tmdb_id); idScores[r.tmdb_id] = (idScores[r.tmdb_id] || 0) + r.rating; });
  watchHistory.forEach(w => { engaged.add(w.tmdb_id); idScores[w.tmdb_id] = (idScores[w.tmdb_id] || 0) + w.plays; });
  favorites.forEach(f => { engaged.add(f.tmdb_id); idScores[f.tmdb_id] = (idScores[f.tmdb_id] || 0) + 5; });

  // Three-tier pipeline
  let items = await getUserCollaborative(db, userId, engaged, idScores);

  if (items.length < 10) {
    const contentItems = await getContentSimilar(db, userId, engaged, idScores);
    items = [...items, ...contentItems];
  }

  if (items.length < 10) {
    const popularItems = await getPopularityFallback(engaged);
    const existingIds = new Set(items.map(i => i.tmdb_id));
    items = [...items, ...popularItems.filter(p => !existingIds.has(p.tmdb_id))];
  }

  // Deduplicate and cap
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    if (!seen.has(item.tmdb_id)) {
      seen.add(item.tmdb_id);
      deduped.push(item);
      if (deduped.length >= 30) break;
    }
  }

  const generationMs = Date.now() - startTime;
  const coverage = deduped.length;

  return {
    items: deduped,
    meta: {
      source: deduped.length > 0 ? deduped[0].source : 'none',
      generation_ms: generationMs,
      coverage,
      engaged_items: engaged.size,
    }
  };
}

module.exports = { generateRecommendations, getCached, setCache };
