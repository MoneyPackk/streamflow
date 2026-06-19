const express = require('express');
const axios = require('axios');
const { resolveVidAraHash, getVidAraUrl } = require('../lib/vidaraResolver');
const { proxyEmbed } = require('../lib/embedProxy');

// Provider pool. Order matters: most reliable first.
// Each entry: { id, label, build(type, id, s, e) -> url, regions }
const PROVIDERS = {
  movie: [
    { id: 'vidsrc',  label: 'VidSrc',     url: (id) => `https://vidsrc.to/embed/movie/${id}` },
    { id: '111movies', label: '111Movies', url: (id) => `https://111movies.com/movie/${id}` },
    { id: 'vidlink', label: 'VidLink',    url: (id) => `https://vidlink.pro/movie/${id}` },
    { id: 'embedsu', label: 'Embed.su',   url: (id) => `https://embed.su/embed/movie/${id}` },
    { id: '2embed',  label: '2Embed',     url: (id) => `https://www.2embed.cc/embed/${id}` },
    { id: 'vidsrccc', label: 'VidSrc.cc', url: (id) => `https://vidsrc.cc/v2/embed/movie/${id}` },
    { id: 'autoembed', label: 'AutoEmbed', url: (id) => `https://autoembed.co/movie/tmdb/${id}` },
    { id: 'superembed', label: 'SuperEmbed', url: (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1` },
    { id: 'smashy',  label: 'Smashy',     url: (id) => `https://player.smashy.stream/movie/${id}` },
    { id: 'moviesapi', label: 'MoviesAPI', url: (id) => `https://moviesapi.club/movie/${id}` },
    { id: 'rivestream', label: 'RiveStream', url: (id) => `https://rivestream.org/embed?type=movie&id=${id}` },
  ],
  tv: [
    { id: 'vidsrc',  label: 'VidSrc',     url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
    { id: '111movies', label: '111Movies', url: (id, s, e) => `https://111movies.com/tv/${id}/${s}/${e}` },
    { id: 'vidlink', label: 'VidLink',    url: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
    { id: 'embedsu', label: 'Embed.su',   url: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
    { id: '2embed',  label: '2Embed',     url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}?s=${s}&e=${e}` },
    { id: 'vidsrccc', label: 'VidSrc.cc', url: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` },
    { id: 'autoembed', label: 'AutoEmbed', url: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}` },
    { id: 'superembed', label: 'SuperEmbed', url: (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
    { id: 'smashy',  label: 'Smashy',     url: (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}` },
    { id: 'moviesapi', label: 'MoviesAPI', url: (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}` },
    { id: 'rivestream', label: 'RiveStream', url: (id, s, e) => `https://rivestream.org/embed?type=tv&id=${id}&s=${s}&e=${e}` },
  ],
};

// Provider health cache. Short TTL because these flip often.
const healthCache = new Map();
const HEALTH_TTL = 3 * 60 * 1000; // 3 min

// Check if a provider URL actually returns a usable embed page.
// We do a GET, time it, and check the body for player indicators.
async function checkProvider(url) {
  const cached = healthCache.get(url);
  if (cached && Date.now() - cached.time < HEALTH_TTL) {
    return cached;
  }

  const t0 = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: 4000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'text',
    });

    const html = res.data || '';
    const body = html.toLowerCase();

    // Real embed pages contain at least one of these markers.
    const playerMarkers = ['<iframe', '<video', 'jwplayer', 'plyr', 'videojs', 'shaka', 'hls', '.m3u8', 'mp4', 'player.php', '/embed/', 'src='];
    const hasPlayer = playerMarkers.some(m => body.includes(m));

    // Pages that explicitly failed.
    const failureMarkers = ['404 not found', 'page not found', 'not found', 'removed', 'taken down', 'geo-blocked', 'cloudflare', 'checking your browser'];
    const isBlocked = failureMarkers.some(m => body.includes(m)) && !hasPlayer;

    const result = {
      healthy: hasPlayer && !isBlocked && res.status < 400,
      latency: Date.now() - t0,
      time: Date.now(),
    };

    healthCache.set(url, result);
    return result;
  } catch (e) {
    const result = { healthy: false, latency: Date.now() - t0, time: Date.now(), error: e.code || e.message };
    healthCache.set(url, result);
    return result;
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

      // Build all candidate URLs in parallel.
      const candidates = list.map(p => ({
        id: p.id,
        name: p.label,
        url: type === 'tv' && season && episode
          ? p.url(tmdb_id, season, episode)
          : p.url(tmdb_id),
      }));

      // Add VidAra if available.
      try {
        const hash = await resolveVidAraHash(tmdb_id, type, season, episode);
        if (hash) {
          const vidAraUrl = getVidAraUrl(hash, type, season, episode);
          if (vidAraUrl) candidates.unshift({ id: 'vidara', name: 'VidAra', url: vidAraUrl });
        }
      } catch {}

      // Probe all providers IN PARALLEL. Hard cap at 5s total.
      const probePromise = Promise.all(
        candidates.map(async (c) => {
          const result = await checkProvider(c.url);
          return { ...c, ...result };
        })
      );
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 5000));
      const probed = await Promise.race([probePromise, timeoutPromise]);

      if (!probed) {
        // Timeout: return all candidates as "unknown", let client try in order.
        return res.json({
          sources: candidates.map((c, i) => ({
            id: c.id,
            name: c.name,
            url: c.url,
            confidence: 'unknown',
            latency: 0,
          })),
        });
      }

      // Sort: healthy first (by latency), then unknown, then dead.
      const ranked = probed
        .map(c => ({
          id: c.id,
          name: c.name,
          url: c.url,
          confidence: c.healthy ? 'high' : (c.error ? 'low' : 'medium'),
          latency: c.latency || 0,
        }))
        .sort((a, b) => {
          const score = { high: 0, medium: 1, low: 2, unknown: 3 };
          if (score[a.confidence] !== score[b.confidence]) {
            return score[a.confidence] - score[b.confidence];
          }
          return a.latency - b.latency;
        });

      // Always return ALL providers so the user can manually pick.
      // Client picks the highest-confidence first, falls back on error.
      res.json({
        sources: ranked,
        bestFirst: ranked.filter(r => r.confidence === 'high').length,
      });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { embedRoutes };