const express = require('express');
const axios = require('axios');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_TOKEN = process.env.TMDB_API_KEY;

const tmdbApi = axios.create({
  baseURL: TMDB_BASE,
  headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  timeout: 10000,
});

// In-memory cache to reduce TMDB hits and avoid 429s
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function cached(key, ttl, fetcher) {
  return async (...args) => {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < ttl) {
      return entry.data;
    }
    const data = await fetcher(...args);
    cache.set(key, { ts: Date.now(), data });
    return data;
  };
}

// Cleanup cache every 30 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.ts > CACHE_TTL * 3) cache.delete(k);
  }
}, 30 * 60 * 1000).unref();

function mapMovie(m) {
  return {
    tmdb_id: m.id,
    title: m.title,
    description: m.overview,
    genre: m.genre_ids ? null : (m.genres || []).map(g => g.name).join(', '),
    release_year: m.release_date ? parseInt(m.release_date) : null,
    type: 'movie',
    poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
    vote_average: m.vote_average,
    release_date: m.release_date,
    original_language: m.original_language,
    vote_count: m.vote_count,
    popularity: m.popularity,
  };
}

function mapShow(s) {
  return {
    tmdb_id: s.id,
    title: s.name,
    description: s.overview,
    genre: s.genre_ids ? null : (s.genres || []).map(g => g.name).join(', '),
    release_year: s.first_air_date ? parseInt(s.first_air_date) : null,
    type: 'tv',
    poster_url: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
    backdrop_url: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : null,
    vote_average: s.vote_average,
    release_date: s.first_air_date,
    original_language: s.original_language,
    vote_count: s.vote_count,
    popularity: s.popularity,
  };
}

// Filter out non-English content for US-audience endpoints
// Real English titles only use Latin alphabet + standard punctuation
const ENGLISH_LANGS = new Set(['en', 'en-US', 'en-GB', '']);
function isEnglishTitle(item) {
  if (!item.original_language) return true;
  if (!ENGLISH_LANGS.has(item.original_language)) return false;
  // Title must be Latin/ASCII only (filters out Chinese, Japanese, Korean, Hindi, Arabic, etc.)
  return /^[A-Za-z0-9\s\-\.,!?'"()&:;\u00C0-\u017F]+$/.test(item.title || item.name || '');
}
function isAmerican(item) {
  // Only filter content that's clearly non-English — don't block new/niche American shows
  if (item.original_language && item.original_language !== 'en') return false;
  return true;
}
function filterEnglish(items) {
  return items.filter(item => isEnglishTitle(item) && isAmerican(item));
}

function tmdbRoutes() {
  const router = express.Router();

  // Cache hit: serve from memory, fetch on miss. Reduces TMDB 429s dramatically.
  const serve = (key, ttl, fetcher) => async (req, res, next) => {
    try {
      const fullKey = `${key}:${JSON.stringify(req.query || {})}`;
      const entry = cache.get(fullKey);
      if (entry && Date.now() - entry.ts < ttl) {
        return res.json(entry.data);
      }
      const data = await fetcher(req);
      cache.set(fullKey, { ts: Date.now(), data });
      res.json(data);
    } catch (err) {
      console.error(`TMDB ${key} error:`, err.response?.status, err.message);
      next(err);
    }
  };

  // Trending - supports ?region=US (filter English-only for American audience)
  router.get('/trending', serve('trending', 10 * 60 * 1000, async (req) => {
    const { data } = await tmdbApi.get('/trending/all/week');
    let items = data.results.map(item =>
      item.media_type === 'tv' ? mapShow(item) : mapMovie(item)
    );
    // Always filter to English content for US audience
    items = filterEnglish(items);
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Search - 1 minute cache, English-only for US audience
  router.get('/search', serve('search', 60 * 1000, async (req) => {
    const { q, type = 'movie', page = 1, region } = req.query;
    if (!q) return { items: [] };
    const params = { query: q, page };
    if (region && type === 'movie') params.region = region;
    const { data } = await tmdbApi.get('/search/multi', { params });
    const items = data.results
      .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
      .map(item => item.media_type === 'tv' ? mapShow(item) : mapMovie(item))
      .filter(isEnglishTitle);
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Popular - English-only for US audience
  router.get('/popular', serve('popular', 10 * 60 * 1000, async (req) => {
    const { type = 'movie', page = 1, region } = req.query;
    const endpoint = type === 'tv' ? '/tv/popular' : '/movie/popular';
    const params = { page };
    if (region && type === 'movie') params.region = region;
    const { data } = await tmdbApi.get(endpoint, { params });
    const items = filterEnglish(data.results.map(item => type === 'tv' ? mapShow(item) : mapMovie(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Top rated - English-only for US audience
  router.get('/top_rated', serve('top_rated', 10 * 60 * 1000, async (req) => {
    const { type = 'movie', page = 1, region } = req.query;
    const endpoint = type === 'tv' ? '/tv/top_rated' : '/movie/top_rated';
    const params = { page };
    if (region && type === 'movie') params.region = region;
    const { data } = await tmdbApi.get(endpoint, { params });
    const items = filterEnglish(data.results.map(item => type === 'tv' ? mapShow(item) : mapMovie(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Now playing - English-only, US region by default
  router.get('/now_playing', serve('now_playing', 10 * 60 * 1000, async (req) => {
    const region = req.query.region || 'US';
    const { data } = await tmdbApi.get('/movie/now_playing', { params: { page: 1, region } });
    const items = filterEnglish(data.results.map(item => mapMovie(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // On the air - English-only
  router.get('/on_the_air', serve('on_the_air', 10 * 60 * 1000, async () => {
    const { data } = await tmdbApi.get('/tv/on_the_air', { params: { page: 1 } });
    const items = filterEnglish(data.results.map(item => mapShow(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Upcoming - English-only, US region by default
  router.get('/upcoming', serve('upcoming', 10 * 60 * 1000, async (req) => {
    const region = req.query.region || 'US';
    const { data } = await tmdbApi.get('/movie/upcoming', { params: { page: 1, region } });
    const items = filterEnglish(data.results.map(item => mapMovie(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // New releases in region - filters by language AND popularity (American content)
  router.get('/new_releases', serve('new_releases', 10 * 60 * 1000, async (req) => {
    const { region = 'US', type = 'movie', page = 1 } = req.query;
    const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
    const today = new Date().toISOString().split('T')[0];
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // First, get top-voted American content. Need to use sort_by=popularity.desc then filter
    const { data } = await tmdbApi.get(endpoint, {
      params: {
        page,
        region,
        sort_by: 'popularity.desc',
        'primary_release_date.gte': yearAgo,
        'primary_release_date.lte': today,
        with_original_language: 'en',
        'vote_count.gte': 5,
      }
    });
    const items = data.results.map(item => type === 'tv' ? mapShow(item) : mapMovie(item));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Discover - default to English-only for US audience
  router.get('/discover', serve('discover', 10 * 60 * 1000, async (req) => {
    const { type = 'movie', sort = 'popularity.desc', page = 1, with_genres, year } = req.query;
    const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
    const { data } = await tmdbApi.get(endpoint, {
      params: {
        sort_by: sort, page, with_genres, primary_release_year: year,
        with_original_language: 'en',
      }
    });
    const items = data.results.map(item => type === 'tv' ? mapShow(item) : mapMovie(item));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Airing today - English-only
  router.get('/airing_today', serve('airing_today', 10 * 60 * 1000, async () => {
    const { data } = await tmdbApi.get('/tv/airing_today', { params: { page: 1 } });
    const items = filterEnglish(data.results.map(item => mapShow(item)));
    return { items, page: data.page, total_pages: data.total_pages };
  }));

  // Genres - 24 hour cache
  router.get('/genres', serve('genres', 24 * 60 * 60 * 1000, async (req) => {
    const { type = 'movie' } = req.query;
    const endpoint = type === 'tv' ? '/genre/tv/list' : '/genre/movie/list';
    const { data } = await tmdbApi.get(endpoint);
    return data.genres;
  }));

  // Details by tmdb_id - 30 min cache
  router.get('/:tmdb_id', async (req, res, next) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'tv' } = req.query;
      const detailKey = `detail:${tmdb_id}:${type}`;
      const detailEntry = cache.get(detailKey);
      if (detailEntry && Date.now() - detailEntry.ts < 30 * 60 * 1000) {
        return res.json(detailEntry.data);
      }
      // Capture res.json to also store in cache
      const origJson = res.json.bind(res);
      res.json = (data) => {
        if (res.statusCode === 200 && data && !data.error) {
          cache.set(detailKey, { ts: Date.now(), data });
        }
        return origJson(data);
      };
      if (tmdb_id.includes('.')) {
        const parts = tmdb_id.split('.');
        if (parts[1] === 'season') {
          const sid = parts[0];
          const seasonNum = parseInt(parts[2]);
          const { data: seasonData } = await tmdbApi.get(`/tv/${sid}/season/${seasonNum}`);
          return res.json({
            episodes: seasonData.episodes.map(ep => ({
              episode_number: ep.episode_number,
              season_number: ep.season_number,
              title: ep.name,
              description: ep.overview,
              still_url: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
              vote_average: ep.vote_average,
            }))
          });
        }
      }

      // Try requested type first
      if (type === 'tv') {
        try {
          const { data } = await tmdbApi.get(`/tv/${tmdb_id}`);
          const show = mapShow(data);
          show.seasons = (data.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({
              season_number: s.season_number,
              episode_count: s.episode_count,
              name: s.name,
              poster_url: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
            }));
          try {
            const [credits, similar] = await Promise.all([
              tmdbApi.get(`/tv/${tmdb_id}/credits`),
              tmdbApi.get(`/tv/${tmdb_id}/similar`),
            ]);
            show.cast = (credits.data.cast || []).slice(0, 12).map(c => ({
              name: c.name, character: c.character,
              photo: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null,
            }));
            show.similar = (similar.data.results || []).slice(0, 10).map(mapShow);
          } catch {}
          return res.json(show);
        } catch (tvErr) {
          if (tvErr.response?.status !== 404) {
            console.error('TMDB TV lookup error:', tvErr.response?.status, tvErr.message);
          }
        }
      }

      // Try movie
      try {
        const { data } = await tmdbApi.get(`/movie/${tmdb_id}`);
        const movie = mapMovie(data);
        try {
          const [credits, similar] = await Promise.all([
            tmdbApi.get(`/movie/${tmdb_id}/credits`),
            tmdbApi.get(`/movie/${tmdb_id}/similar`),
          ]);
          movie.cast = (credits.data.cast || []).slice(0, 12).map(c => ({
            name: c.name, character: c.character,
            photo: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null,
          }));
          movie.similar = (similar.data.results || []).slice(0, 10).map(mapMovie);
        } catch {}
        return res.json(movie);
      } catch (movieErr) {
        if (movieErr.response?.status !== 404) {
          console.error('TMDB movie lookup error:', movieErr.response?.status, movieErr.message);
        }
      }

      // If type was tv and failed, try as movie first (in case type was wrong)
      if (type === 'tv') {
        try {
          const { data } = await tmdbApi.get(`/movie/${tmdb_id}`);
          return res.json(mapMovie(data));
        } catch {}
      } else {
        try {
          const { data } = await tmdbApi.get(`/tv/${tmdb_id}`);
          return res.json(mapShow(data));
        } catch {}
      }

      return res.status(404).json({ error: 'Not found on TMDB' });
    } catch (err) {
      console.error('TMDB details error:', err.response?.status, err.message);
      next(err);
    }
  });

  // Season episodes - 1 hour cache
  router.get('/:tmdb_id/season/:num', async (req, res, next) => {
    try {
      const { tmdb_id, num } = req.params;
      const sKey = `season:${tmdb_id}:${num}`;
      const sEntry = cache.get(sKey);
      if (sEntry && Date.now() - sEntry.ts < 60 * 60 * 1000) {
        return res.json(sEntry.data);
      }
      const { data } = await tmdbApi.get(`/tv/${tmdb_id}/season/${num}`);
      const result = {
        episodes: data.episodes.map(ep => ({
          episode_number: ep.episode_number,
          season_number: ep.season_number,
          title: ep.name,
          description: ep.overview,
          still_url: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
          vote_average: ep.vote_average,
        }))
      };
      cache.set(sKey, { ts: Date.now(), data: result });
      res.json(result);
    } catch (err) {
      console.error('TMDB season error:', err.response?.status, err.message);
      next(err);
    }
  });

  return router;
}

module.exports = tmdbRoutes;
