const express = require('express');

// Provider pool — regularly tested sources.
// Ordered by reliability: best sources first, worst last.
// vidsrc.to kept as last resort since it has the most content.
const PROVIDERS = {
  movie: [
    { id: 'superembed',  url: (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1` },
    { id: '2embed',      url: (id) => `https://www.2embed.cc/embed/${id}` },
    { id: 'vidsrc',      url: (id) => `https://vidsrc.to/embed/movie/${id}` },
    { id: 'vidlink',     url: (id) => `https://vidlink.pro/movie/${id}` },
    { id: 'moviesapi',   url: (id) => `https://moviesapi.club/movie/${id}` },
  ],
  tv: [
    { id: 'superembed',  url: (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&season=${s}&episode=${e}` },
    { id: '2embed',      url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
    { id: 'vidsrc',      url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
    { id: 'vidlink',     url: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
    { id: 'moviesapi',   url: (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}` },
  ],
};

function embedRoutes() {
  const router = express.Router();

  router.get('/proxy', (req, res) => {
    const { url } = req.query;
    if (url) return res.redirect(302, decodeURIComponent(url));
    res.status(400).json({ error: 'Missing url' });
  });

  // Return ordered source list. No provider names or URLs exposed to client.
  router.get('/:tmdb_id', async (req, res, next) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid id' });

      const list = PROVIDERS[type] || PROVIDERS.movie;
      const isTv = type === 'tv' && season && episode;

      const sources = list.map((p, i) => ({
        id: i,
        load_url: `/api/embed/load/${i}/${tmdb_id}?type=${type}${isTv ? `&season=${season}&episode=${episode}` : ''}`,
      }));

      res.json({ sources });
    } catch (e) { next(e); }
  });

  // Server-side redirect — client never sees the provider URL.
  router.get('/load/:idx/:tmdb_id', (req, res) => {
    const { idx, tmdb_id } = req.params;
    const { type = 'movie', season, episode } = req.query;
    if (!/^\d+$/.test(tmdb_id) || !/^\d+$/.test(idx)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const list = PROVIDERS[type] || PROVIDERS.movie;
    const provider = list[parseInt(idx)];
    if (!provider) return res.status(404).json({ error: 'Source not found' });

    const url = type === 'tv' && season && episode
      ? provider.url(tmdb_id, season, episode)
      : provider.url(tmdb_id);

    res.redirect(302, url);
  });

  return router;
}

module.exports = { embedRoutes };
