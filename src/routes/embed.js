const express = require('express');
const { resolveVidAraHash, getVidAraUrl } = require('../lib/vidaraResolver');

const PROVIDERS = {
  movie: [
    ['VidLink', (id) => `https://vidlink.pro/movie/${id}`],
    ['VidSrc', (id) => `https://vidsrc.to/embed/movie/${id}`],
    ['2Embed', (id) => `https://www.2embed.cc/embed/${id}`],
    ['SuperEmbed', (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`],
    ['VidBinge', (id) => `https://vidbinge.dev/embed/movie/${id}`],
    ['VidSrc v3', (id) => `https://vidsrc.to/v3/embed/movie/${id}`],
    ['AutoEmbed', (id) => `https://autoembed.co/movie/tmdb/${id}`],
    ['MoviesAPI', (id) => `https://moviesapi.club/movie/${id}`],
    ['111Movies', (id) => `https://111movies.com/embed/movie/${id}`],
    ['Smashystream', (id) => `https://player.smashy.stream/movie/${id}`],
    ['RiveStream', (id) => `https://rivestream.org/embed?type=movie&id=${id}`],
  ],
  tv: [
    ['VidLink', (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`],
    ['VidSrc', (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`],
    ['2Embed', (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`],
    ['SuperEmbed', (id, s, e) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}`],
    ['VidBinge', (id, s, e) => `https://vidbinge.dev/embed/tv/${id}/${s}/${e}`],
    ['VidSrc v3', (id, s, e) => `https://vidsrc.to/v3/embed/tv/${id}/${s}/${e}`],
    ['AutoEmbed', (id, s, e) => `https://autoembed.co/tv/tmdb/${id}-${s}-${e}`],
    ['MoviesAPI', (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}`],
    ['111Movies', (id, s, e) => `https://111movies.com/embed/tv/${id}/${s}/${e}`],
    ['Smashystream', (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`],
  ],
};

function embedRoutes() {
  const router = express.Router();

  router.get('/:tmdb_id', async (req, res, next) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;
      if (!/^\d+$/.test(tmdb_id)) return res.status(400).json({ error: 'Invalid id' });

      const list = PROVIDERS[type] || PROVIDERS.movie;
      const sources = list.map(([name, fn]) => ({
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

      res.json({ sources });
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { embedRoutes };
