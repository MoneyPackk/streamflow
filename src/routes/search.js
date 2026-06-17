const express = require('express');
const axios = require('axios');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_TOKEN = process.env.TMDB_API_KEY;
const tmdbApi = axios.create({
  baseURL: TMDB_BASE,
  headers: { Authorization: `Bearer ${TMDB_TOKEN}` },
  timeout: 10000,
});

// In-memory autocomplete cache
const acCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function searchRoutes() {
  const router = express.Router();

  // Search v2: query, type, year, genre, sort, page
  router.get('/', async (req, res, next) => {
    try {
      const { q = '', type = 'movie', year, genre, sort = 'popularity.desc', page = 1, with_original_language = 'en', min_votes = 5 } = req.query;
      if (q) {
        // Text search via /search/multi
        const params = { query: q, page, include_adult: false, with_original_language };
        const { data } = await tmdbApi.get(`/search/${type === 'tv' ? 'tv' : 'movie'}`, { params });
        let items = (data.results || []).map(m => ({
          tmdb_id: m.id, title: type === 'tv' ? m.name : m.title, type,
          poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          release_year: (type === 'tv' ? m.first_air_date : m.release_date) ? parseInt((type === 'tv' ? m.first_air_date : m.release_date)) : null,
          vote_average: m.vote_average, vote_count: m.vote_count,
          original_language: m.original_language, overview: m.overview,
        }));
        // Client-side English filter
        items = items.filter(i => /^[A-Za-z0-9\s\-\.,!?'"()&:;\u00C0-\u017F]+$/.test(i.title || ''));
        if (min_votes) items = items.filter(i => (i.vote_count || 0) >= min_votes);
        if (year) items = items.filter(i => i.release_year === parseInt(year));
        return res.json({ items, page: data.page, total_pages: data.total_pages });
      }
      // Discover: filters
      const params = {
        sort_by: sort,
        page,
        include_adult: false,
        with_original_language,
        'vote_count.gte': parseInt(min_votes) || 5,
      };
      if (year) params[type === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = year;
      if (genre) params.with_genres = genre;
      const endpoint = type === 'tv' ? '/discover/tv' : '/discover/movie';
      const { data } = await tmdbApi.get(endpoint, { params });
      const items = (data.results || []).map(m => ({
        tmdb_id: m.id, title: type === 'tv' ? m.name : m.title, type,
        poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        release_year: (type === 'tv' ? m.first_air_date : m.release_date) ? parseInt((type === 'tv' ? m.first_air_date : m.release_date)) : null,
        vote_average: m.vote_average, vote_count: m.vote_count,
        original_language: m.original_language, overview: m.overview,
      }));
      res.json({ items, page: data.page, total_pages: data.total_pages });
    } catch (e) {
      console.error('Search v2 error:', e.message);
      next(e);
    }
  });

  // Autocomplete suggestions (cached, 1h)
  router.get('/suggest', async (req, res, next) => {
    try {
      const q = (req.query.q || '').trim();
      if (q.length < 2) return res.json({ suggestions: [] });
      const key = `ac:${q.toLowerCase()}`;
      const cached = acCache.get(key);
      if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);
      const { data } = await tmdbApi.get('/search/multi', {
        params: { query: q, page: 1, include_adult: false, with_original_language: 'en' },
      });
      const suggestions = (data.results || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .filter(r => /^[A-Za-z0-9\s\-\.,!?'"()&:;\u00C0-\u017F]+$/.test(r.title || r.name || ''))
        .slice(0, 8)
        .map(r => ({
          title: r.title || r.name,
          type: r.media_type,
          year: r.release_date ? parseInt(r.release_date) : (r.first_air_date ? parseInt(r.first_air_date) : null),
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null,
          tmdb_id: r.id,
        }));
      const payload = { suggestions };
      acCache.set(key, { ts: Date.now(), data: payload });
      res.json(payload);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = searchRoutes;
