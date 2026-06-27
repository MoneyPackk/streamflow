const express = require('express');
const axios = require('axios');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const BEARER = process.env.TMDB_API_KEY;

function moviesRoutes() {
  const router = express.Router();

  // In-memory cache (10 min TTL)
  const cache = new Map();
  const CACHE_TTL = 10 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.timestamp > CACHE_TTL) cache.delete(key);
    }
  }, 30 * 60 * 1000);

  function getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
    return null;
  }

  function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
  }

  async function tmdb(url, params = {}) {
    const cacheKey = url + JSON.stringify(params);
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const { data } = await axios.get(`${TMDB_BASE}${url}`, {
      params: { language: 'en-US', ...params },
      headers: { Authorization: `Bearer ${BEARER}` },
      timeout: 8000,
    });

    setCache(cacheKey, data);
    return data;
  }

  function mapMovie(item, type) {
    return {
      id: item.id,
      tmdb_id: item.id,
      title: item.title || item.name || '',
      poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
      backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '',
      synopsis: item.overview || '',
      year: (item.release_date || item.first_air_date || '').split('-')[0] || 0,
      rating: item.vote_average || 0,
      duration: item.runtime ? `${item.runtime}m` : item.episode_run_time?.[0] ? `${item.episode_run_time[0]}m` : '',
      genres: (item.genres || []).map((g) => (typeof g === 'string' ? g : g.name)),
      director: item.director || '',
      cast: [],
      is_tv: type === 'tv',
    };
  }

  // GET /api/movies — list with filters
  router.get('/', async (req, res, next) => {
    try {
      const { featured, trending, genre, sort } = req.query;

      let results = [];

      if (featured === 'true' || trending === 'true') {
        const data = await tmdb('/trending/all/week');
        results = (data.results || []).filter((m) => m.original_language === 'en').slice(0, 20);
      } else {
        const discoverParams = {
          with_original_language: 'en',
          'vote_count.gte': 100,
          sort_by: 'popularity.desc',
        };

        if (sort === 'rating') {
          discoverParams.sort_by = 'vote_average.desc';
          discoverParams['vote_count.gte'] = 500;
        } else if (sort === 'year') {
          discoverParams.sort_by = 'primary_release_date.desc';
        }

        if (genre) {
          discoverParams.with_genres = genre;
        }

        const data = await tmdb('/discover/movie', discoverParams);
        results = (data.results || []).slice(0, 20);
      }

      res.json(results.map((m) => mapMovie(m)));
    } catch (e) {
      next(e);
    }
  });

  // GET /api/movies/:id — movie detail with cast
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;
      const type = req.query.type || 'movie';

      const [detail, credits] = await Promise.all([
        tmdb(`/${type}/${id}`),
        tmdb(`/${type}/${id}/credits`),
      ]);

      const movie = mapMovie(detail, type);
      movie.cast = (credits.cast || []).slice(0, 10).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      }));
      movie.director = (credits.crew || []).find((c) => c.job === 'Director')?.name || '';

      if (type === 'tv') {
        const seasons = await tmdb(`/tv/${id}`);
        movie.seasons = (seasons.seasons || [])
          .filter((s) => s.season_number > 0)
          .map((s) => ({
            id: s.id,
            number: s.season_number,
            title: s.name,
            episode_count: s.episode_count,
          }));
      }

      res.json(movie);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = moviesRoutes;
