const express = require('express');
const axios = require('axios');
const { resolveVidAraHash, getVidAraUrl } = require('../lib/vidaraResolver');
const { proxyEmbed } = require('../lib/embedProxy');

const PROVIDERS = {
  movie: [
    ['VidLink', (id) => `https://vidlink.pro/movie/${id}`],
    ['2Embed', (id) => `https://www.2embed.cc/embed/${id}`],
    ['SuperEmbed', (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`],
    ['AutoEmbed', (id) => `https://autoembed.co/movie/tmdb/${id}`],
    ['MoviesAPI', (id) => `https://moviesapi.club/movie/${id}`],
    ['Smashystream', (id) => `https://player.smashy.stream/movie/${id}`],
    ['RiveStream', (id) => `https://rivestream.org/embed?type=movie&id=${id}`],
    ['VidSrc.cc', (id) => `https://vidsrc.cc/v2/embed/movie/${id}`],
    ['Embed.su', (id) => `https://embed.su/embed/movie/${id}`],
  ],
  tv: [
    ['VidLink', (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`],
    ['2Embed', (id, s, e) => `https://www.2embed.cc/embedtv/${id}?s=${s}&e=${e}`],
    ['SuperEmbed', (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}`],
    ['AutoEmbed', (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`],
    ['MoviesAPI', (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}`],
    ['Smashystream', (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`],
    ['RiveStream', (id, s, e) => `https://rivestream.org/embed?type=tv&id=${id}&s=${s}&e=${e}`],
    ['VidSrc.cc', (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`],
    ['Embed.su', (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`],
  ],
};

// Generic labels for white-labeling
const GENERIC_LABELS = ['Primary', 'Backup 1', 'Backup 2', 'Backup 3', 'Backup 4', 'Backup 5', 'Backup 6', 'Backup 7', 'Backup 8', 'Backup 9'];

// Provider health cache (30 min TTL)
const healthCache = new Map();
const HEALTH_TTL = 30 * 60 * 1000;

async function checkProviderHealth(url) {
  const cached = healthCache.get(url);
  if (cached && Date.now() - cached.time < HEALTH_TTL) {
    return cached.healthy;
  }
  
  try {
    const res = await axios.head(url, { 
      timeout: 5000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    const healthy = res.status >= 200 && res.status < 400;
    healthCache.set(url, { healthy, time: Date.now() });
    return healthy;
  } catch {
    healthCache.set(url, { healthy: false, time: Date.now() });
    return false;
  }
}

function embedRoutes() {
  const router = express.Router();

  router.get('/proxy', proxyEmbed);

  router.get('/:tmdb_id', async (req, res, next) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid id' });

      const list = PROVIDERS[type] || PROVIDERS.movie;
      let sources = list.map(([name, fn]) => ({
        name,
        url: type === 'tv' && season && episode ? fn(tmdb_id, season, episode) : fn(tmdb_id),
      }));

      // Try VidAra resolver for niche content
      try {
        const hash = await resolveVidAraHash(tmdb_id, type, season, episode);
        if (hash) {
          const vidAraUrl = getVidAraUrl(hash, type, season, episode);
          if (vidAraUrl) sources.unshift({ name: 'VidAra', url: vidAraUrl });
        }
      } catch {}

      // Check provider health and filter dead ones
      const healthySources = [];
      for (let i = 0; i < sources.length; i++) {
        const isHealthy = await checkProviderHealth(sources[i].url);
        if (isHealthy) {
          healthySources.push(sources[i]);
        }
      }

      // If no healthy sources, return all (fallback)
      const finalSources = healthySources.length > 0 ? healthySources : sources;
      
      // White-label: replace names with generic labels
      finalSources.forEach((s, i) => {
        s.name = GENERIC_LABELS[i] || `Server ${i + 1}`;
      });

      res.json({ sources: finalSources });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { embedRoutes };
