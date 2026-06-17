// VidAra Hash Resolver — converts TMDB ID to VidAra embed hash for niche content
const axios = require('axios');

// Cache for resolved hashes to avoid repeated scraping
const hashCache = new Map();
const HASH_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function resolveVidAraHash(tmdbId, type, season, episode) {
  const cacheKey = `${tmdbId}:${type}:${season || ''}:${episode || ''}`;
  const cached = hashCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HASH_CACHE_TTL) {
    return cached.hash;
  }

  try {
    // VidAra has a search endpoint that can find content by TMDB ID
    const searchUrl = `https://vidara.to/search?keyword=${tmdbId}`;
    const res = await axios.get(searchUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html',
      },
    });

    // Try to extract hash from JSON response
    const data = res.data;
    if (typeof data === 'string') {
      // HTML response — try to find vidara embed URL pattern
      const match = data.match(/vidara\.to\/e\/([a-zA-Z0-9]+)/);
      if (match) {
        hashCache.set(cacheKey, { ts: Date.now(), hash: match[1] });
        return match[1];
      }

      // Try alternate pattern for TV shows
      const tvMatch = data.match(new RegExp(`/watch/${type === 'tv' ? 'tv' : 'movie'}/${tmdbId}`));
      if (tvMatch) {
        // Found the show page, now get the embed hash from it
        const detailUrl = `https://vidara.to${tvMatch[0]}`;
        const detailRes = await axios.get(detailUrl, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const hashMatch = detailRes.data.match(/vidara\.to\/e\/([a-zA-Z0-9]+)/);
        if (hashMatch) {
          hashCache.set(cacheKey, { ts: Date.now(), hash: hashMatch[1] });
          return hashMatch[1];
        }
      }
    } else if (data?.results?.length) {
      // JSON response with search results
      const item = data.results.find(r => String(r.id) === String(tmdbId) || r.tmdbId === tmdbId);
      if (item?.embedHash) {
        hashCache.set(cacheKey, { ts: Date.now(), hash: item.embedHash });
        return item.embedHash;
      }
    }

    return null;
  } catch (e) {
    console.error('VidAra resolver error:', e.message);
    return null;
  }
}

function getVidAraUrl(hash, type, season, episode) {
  if (!hash) return null;
  if (type === 'tv' && season && episode) {
    return `https://vidara.to/e/${hash}?s=${season}&e=${episode}`;
  }
  return `https://vidara.to/e/${hash}`;
}

module.exports = { resolveVidAraHash, getVidAraUrl };
