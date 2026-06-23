const express = require('express');

// Provider pool — ordered by reliability.
// These are embed providers designed for iframe embedding.
// We do NOT health-check them server-side (Cloudflare blocks axios but allows browser iframes).
// The client cycles through them silently, advancing on load failure.
const PROVIDERS = {
  movie: [
    { id: 'vidsrccc',   url: (id) => `https://vidsrc.cc/v2/embed/movie/${id}` },
    { id: 'autoembed',  url: (id) => `https://autoembed.co/movie/tmdb/${id}` },
    { id: 'vidlink',    url: (id) => `https://vidlink.pro/movie/${id}` },
    { id: 'embedsu',    url: (id) => `https://embed.su/embed/movie/${id}` },
    { id: 'superembed', url: (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1` },
    { id: 'smashy',     url: (id) => `https://player.smashy.stream/movie/${id}` },
    { id: 'moviesapi',  url: (id) => `https://moviesapi.club/movie/${id}` },
    { id: 'vidsrc',     url: (id) => `https://vidsrc.to/embed/movie/${id}` },
    { id: '2embed',     url: (id) => `https://www.2embed.cc/embed/${id}` },
    { id: '111movies',  url: (id) => `https://111movies.com/movie/${id}` },
    { id: 'rivestream', url: (id) => `https://rivestream.org/embed?type=movie&id=${id}` },
  ],
  tv: [
    { id: 'vidsrccc',   url: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` },
    { id: 'autoembed',  url: (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}` },
    { id: 'vidlink',    url: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
    { id: 'embedsu',    url: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
    { id: 'superembed', url: (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
    { id: 'smashy',     url: (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}` },
    { id: 'moviesapi',  url: (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}` },
    { id: 'vidsrc',     url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
    { id: '2embed',     url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}?s=${s}&e=${e}` },
    { id: '111movies',  url: (id, s, e) => `https://111movies.com/tv/${id}/${s}/${e}` },
    { id: 'rivestream', url: (id, s, e) => `https://rivestream.org/embed?type=tv&id=${id}&s=${s}&e=${e}` },
  ],
};

function embedRoutes() {
  const router = express.Router();

  // Return ordered source list. No health probing — the client cycles through.
  // URLs are NOT exposed to the client. We return opaque source IDs only.
  // The client loads each source via /api/embed/load/:idx which redirects server-side.
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

  // Server-side redirect — builds the real provider URL and 302 redirects.
  // The client never sees the provider URL. The iframe loads the redirect target directly.
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
