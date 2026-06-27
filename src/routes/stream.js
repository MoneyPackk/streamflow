const express = require('express');
const axios = require('axios');
const { optionalAuth } = require('../middleware/auth');
const { getPlan, getFeaturesForPlan } = require('../config/pricing');

const TORBOX_API = 'https://api.torbox.app/v1/api';
const TORRENTIO = 'https://torrentio.strem.fun';

// Real-Debrid API
const RD_API_BASE = 'https://api.real-debrid.com/rest/1.0';

function streamRoutes() {
  const router = express.Router();

  function hasActiveSubscription(db, userId) {
    if (!db || !userId) return false;
    const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
    return sub && ['active', 'trialing'].includes(sub.status);
  }

  // Scrape Torrentio for available streams (torrents with infoHash)
  async function scrapeTorrentio(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv' && season && episode) {
      url = `${TORRENTIO}/stream/series/${tmdbId}:${season}:${episode}.json`;
    } else {
      url = `${TORRENTIO}/stream/${type}/${tmdbId}.json`;
    }
    try {
      const { data } = await axios.get(url, { timeout: 15000 });
      if (!data?.streams) return [];
      return data.streams
        .filter(s => s.infoHash)
        .map(s => {
          const match = s.title ? s.title.match(/(\d{3,4})p/) : null;
          return {
            quality: match ? parseInt(match[1]) : 0,
            infoHash: s.infoHash.toLowerCase(),
            fileIdx: parseInt(s.fileIdx) || 0,
            title: s.title || s.name || '',
          };
        })
        .sort((a, b) => b.quality - a.quality);
    } catch {
      return []; // Torrentio may be down
    }
  }

  // Fallback scraper: search Pirate Bay via Apibay when Torrentio returns nothing
  async function scrapePirateBay(title, year, type, season, episode) {
    try {
      const searchQuery = encodeURIComponent(`${title} ${year || ''}`.trim());
      const { data } = await axios.get(`https://apibay.org/q.php?q=${searchQuery}`, { timeout: 15000 });
      if (!data || !Array.isArray(data)) return [];

      // Filter for video files
      const videoCats = ['201', '202', '203', '204', '205', '206', '207', '208']; // movies
      if (type === 'tv') {
        videoCats.push('208'); // TV shows
      }

      return data
        .filter(t => t && t.info_hash && videoCats.includes(t.category))
        .map(t => {
          const quality = t.name ? (t.name.match(/(\d{3,4})p/) || [])[1] : null;
          return {
            quality: quality ? parseInt(quality) : 0,
            infoHash: t.info_hash.toLowerCase(),
            fileIdx: 0,
            title: t.name || '',
            seeders: parseInt(t.seeders) || 0,
          };
        })
        .filter(t => t.seeders > 0)
        .sort((a, b) => b.seeders - a.seeders || b.quality - a.quality);
    } catch {
      return [];
    }
  }

  // Try Real-Debrid: check cache, add magnet, unrestrict
  async function resolveViaRealDebrid(streams, rdKey) {
    const rdApi = axios.create({
      baseURL: RD_API_BASE,
      headers: { Authorization: `Bearer ${rdKey}` },
      timeout: 15000,
    });

    for (const s of streams) {
      try {
        // 1. Check if Real-Debrid has this hash cached
        const availRes = await rdApi.get(`/torrents/instantAvailability/${s.infoHash}`);
        const availData = availRes.data;

        // If cached, availData[s.infoHash] will have variants array
        const variants = availData?.[s.infoHash];
        if (!variants || variants.length === 0) continue;

        // Find the best file: prefer the one matching our fileIdx, or largest
        const rdFiles = variants[0] || [];
        let selectedFile = null;
        let selectedIdx = s.fileIdx;

        // If we have a specific fileIdx, check if it's available
        if (s.fileIdx > 0 && rdFiles[s.fileIdx]) {
          selectedFile = rdFiles[s.fileIdx];
        } else {
          // Pick the largest file
          let largestSize = 0;
          for (const [idx, f] of Object.entries(rdFiles)) {
            const size = parseInt(f?.files?.[0]?.filesize || f?.filesize || '0');
            if (size > largestSize) {
              largestSize = size;
              selectedIdx = parseInt(idx);
              selectedFile = f;
            }
          }
        }

        if (!selectedFile) continue;

        // 2. Add magnet to Real-Debrid
        const magnet = `magnet:?xt=urn:btih:${s.infoHash}`;
        const addRes = await rdApi.post('/torrents/addMagnet', `magnet=${encodeURIComponent(magnet)}`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const torrentId = addRes.data?.id;
        if (!torrentId) continue;

        // 3. Select files to download (select the one we want)
        await rdApi.post(`/torrents/selectFiles/${torrentId}`, `files=${selectedIdx}`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        // 4. Wait for it to be ready (poll up to 10s)
        let downloadLink = null;
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const infoRes = await rdApi.get(`/torrents/info/${torrentId}`);
          const info = infoRes.data;

          if (info?.links?.length > 0) {
            const link = info.links[selectedIdx] || info.links[0];
            if (link) {
              // 5. Unrestrict the link to get a direct download URL
              const unrestrictRes = await rdApi.post('/unrestrict/link', `link=${encodeURIComponent(link)}`, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              });
              downloadLink = unrestrictRes.data?.download;
              if (downloadLink) break;
            }
          }

          if (info?.status === 'downloaded' || info?.status === 'magnet_error') break;
        }

        if (downloadLink) {
          return {
            url: downloadLink,
            quality: s.quality,
            name: s.title,
            source: 'realdebrid',
          };
        }
      } catch (err) {
        // 403 = account not premium, 404 = hash not cached — skip silently
        if (err.response?.status !== 404 && err.response?.status !== 403) {
          console.error(`[Stream] RD error for ${s.infoHash}:`, err.response?.status, err.message);
        }
        continue;
      }
    }
    return null;
  }

  // Try TorBox as fallback
  async function resolveViaTorBox(streams, tbKey) {
    if (!tbKey) return null;

    for (const s of streams) {
      try {
        // Check if TorBox has this hash cached
        const cachedRes = await axios.get(`${TORBOX_API}/torrents/checkcached`, {
          params: { hash: s.infoHash, format: 'object', list_files: true },
          headers: { Authorization: `Bearer ${tbKey}` },
          timeout: 10000,
        });

        const cacheData = cachedRes.data?.data;
        const isCached = cacheData && cacheData[s.infoHash];

        if (!isCached) {
          // Try adding as cached-only
          try {
            const magnet = `magnet:?xt=urn:btih:${s.infoHash}`;
            const addRes = await axios.post(
              `${TORBOX_API}/torrents/createtorrent`,
              { magnet, add_only_if_cached: true },
              {
                headers: {
                  Authorization: `Bearer ${tbKey}`,
                  'Content-Type': 'multipart/form-data',
                },
                timeout: 20000,
              }
            );

            const torrentId = addRes.data?.data?.torrent_id;
            if (torrentId) {
              for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const listRes = await axios.get(`${TORBOX_API}/torrents/mylist`, {
                  params: { id: torrentId, bypass_cache: true },
                  headers: { Authorization: `Bearer ${tbKey}` },
                  timeout: 8000,
                });
                if (listRes.data?.data?.download_present) break;
              }

              const dlRes = await axios.get(`${TORBOX_API}/torrents/requestdl`, {
                params: { token: tbKey, torrent_id: torrentId, file_id: s.fileIdx || 0, redirect: false },
                timeout: 15000,
              });

              const url = dlRes.data?.data;
              if (url) {
                return { url, quality: s.quality, name: s.title, source: 'torbox' };
              }
            }
          } catch {
            continue;
          }
          continue;
        }

        // Already cached — pick the largest video file
        const cachedInfo = cacheData[s.infoHash];
        const files = cachedInfo.files || [];
        let bestFileIdx = 0;
        let bestSize = 0;
        for (const f of files) {
          const fSize = parseInt(f.size) || 0;
          if (fSize > bestSize && (f.mimetype || '').startsWith('video/')) {
            bestSize = fSize;
            bestFileIdx = typeof f.id === 'number' ? f.id : parseInt(f.id) || 0;
          }
        }
        const dlRes = await axios.get(`${TORBOX_API}/torrents/requestdl`, {
          params: { token: tbKey, torrent_id: cachedInfo.id, file_id: bestFileIdx, redirect: false },
          timeout: 15000,
        });

        const url = dlRes.data?.data;
        if (url) {
          return { url, quality: s.quality, name: s.name || s.title, source: 'torbox' };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  // Resolve stream for a tmdb_id using Real-Debrid (primary) + TorBox (fallback)
  router.get('/:tmdb_id', optionalAuth, async (req, res) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;

      const rdKey = process.env.RD_API_KEY;
      const tbKey = process.env.TORBOX_API_KEY;

      if (!rdKey && !tbKey) {
        return res.json({
          available: false,
          reason: 'No streaming source configured. Add RD_API_KEY or TORBOX_API_KEY to .env',
        });
      }

      const isSubscribed = req.user && hasActiveSubscription(req.app.locals.db, req.user.id);

      // 1. Scrape Torrentio for available torrents
      console.log(`[Stream] Resolving ${type}/${tmdb_id}...`);
      let streams = await scrapeTorrentio(tmdb_id, type, season, episode);
      console.log(`[Stream] Torrentio returned ${streams.length} streams`);

      // 1b. Fallback: if Torrentio returns nothing, search Pirate Bay
      if (streams.length === 0) {
        try {
          // Get title/year from TMDB for the search query
          const tmdbRes = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdb_id}`, {
            params: { language: 'en-US' },
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            timeout: 5000,
          });
          const title = tmdbRes.data?.title || tmdbRes.data?.name || '';
          const year = (tmdbRes.data?.release_date || tmdbRes.data?.first_air_date || '').split('-')[0];
          console.log(`[Stream] Searching Pirate Bay for "${title} ${year}"`);
          streams = await scrapePirateBay(title, year, type, season, episode);
          console.log(`[Stream] Pirate Bay returned ${streams.length} streams`);
        } catch (e) {
          console.log(`[Stream] TMDB lookup failed:`, e.message);
        }
      }

      if (streams.length === 0) {
        return res.json({ available: false, reason: 'No torrent sources found for this title' });
      }

      // 2. Try Real-Debrid first (fastest, most reliable)
      if (rdKey) {
        const rdResult = await resolveViaRealDebrid(streams, rdKey);
        if (rdResult) {
          console.log(`[Stream] Resolved via Real-Debrid (${rdResult.quality}p)`);
          // Gate for subscription — non-subscribers get a preview-limited URL
          if (!isSubscribed) {
            return res.json({
              url: rdResult.url,
              quality: rdResult.quality || 720,
              preview: true,
              duration_seconds: 300,
              name: rdResult.name,
              source: rdResult.source,
            });
          }
          return res.json(rdResult);
        }
      }

      // 3. Fallback to TorBox
      if (tbKey) {
        console.log(`[Stream] Trying TorBox fallback...`);
        const tbResult = await resolveViaTorBox(streams, tbKey);
        if (tbResult) {
          console.log(`[Stream] Resolved via TorBox (${tbResult.quality}p)`);
          if (!isSubscribed) {
            return res.json({
              url: tbResult.url,
              quality: tbResult.quality || 720,
              preview: true,
              duration_seconds: 300,
              name: tbResult.name,
              source: tbResult.source,
            });
          }
          return res.json(tbResult);
        }
      }

      // 4. No source found
      return res.json({
        available: false,
        reason: 'Not available on any streaming source. Try the embed players.',
      });
    } catch (err) {
      console.error('[Stream] Error:', err.response?.status, err.message);
      res.json({ available: false, reason: err.message || 'Stream resolution failed' });
    }
  });

  return router;
}

module.exports = streamRoutes;
