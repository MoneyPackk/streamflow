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
      let query = title;
      if (type === 'tv' && season && episode) {
        query += ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
      } else if (year) {
        query += ` ${year}`;
      }
      const searchQuery = encodeURIComponent(query.trim());
      const { data } = await axios.get(`https://apibay.org/q.php?q=${searchQuery}`, { timeout: 10000 });
      if (!data || !Array.isArray(data)) return [];

      const videoCats = ['201', '202', '203', '204', '205', '206', '207', '208'];
      if (type === 'tv') videoCats.push('208');

      return data
        .filter(t => t && t.info_hash && videoCats.includes(t.category))
        .map(t => {
          const quality = t.name ? (t.name.match(/(\d{3,4})p/) || [])[1] : null;
          return {
            quality: quality ? parseInt(quality) : 0,
            infoHash: t.info_hash.toLowerCase(),
            fileIdx: 0,
            title: t.name || '',
            name: t.name || '',
            seeders: parseInt(t.seeders) || 0,
          };
        })
        .filter(t => t.seeders > 0)
        .sort((a, b) => b.seeders - a.seeders || b.quality - a.quality);
    } catch {
      return [];
    }
  }

  // Try Real-Debrid: add magnet, select files, unrestrict
  async function resolveViaRealDebrid(streams, rdKey) {
    if (!rdKey || streams.length === 0) return null;

    const rdApi = axios.create({
      baseURL: RD_API_BASE,
      headers: { Authorization: `Bearer ${rdKey}` },
      timeout: 15000,
    });

    // Limit to first 5 streams max to avoid long timeouts
    const candidates = streams.slice(0, 5);

    for (const s of candidates) {
      try {
        // 1. Add magnet to Real-Debrid
        // If it's cached, RD will immediately show it as available
        const magnet = `magnet:?xt=urn:btih:${s.infoHash}`;
        const addRes = await rdApi.post('/torrents/addMagnet', `magnet=${encodeURIComponent(magnet)}`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const torrentId = addRes.data?.id;
        if (!torrentId) continue;

        // 2. Check what files are available and select them
        const infoRes = await rdApi.get(`/torrents/info/${torrentId}`);
        const info = infoRes.data;

        // If RD doesn't have this cached, status will be 'magnet_conversion' or error
        if (info?.status === 'magnet_error' || info?.status === 'error') {
          // Delete failed torrent
          await rdApi.delete(`/torrents/delete/${torrentId}`).catch(() => {});
          continue;
        }

        // Select all files to start processing
        const files = info?.files || [];
        if (files.length === 0) {
          await rdApi.delete(`/torrents/delete/${torrentId}`).catch(() => {});
          continue;
        }

        // Find the largest video file
        let selectedIdxs = [];
        let bestVideoIdx = '0';
        let bestSize = 0;
        for (const f of files) {
          const idx = f.id;
          const fSize = parseInt(f.size) || 0;
          const isVideo = (f.path || '').match(/\.(mp4|mkv|avi|mov|m4v|webm)$/i);
          if (isVideo && fSize > bestSize) {
            bestSize = fSize;
            bestVideoIdx = idx;
          }
          selectedIdxs.push(idx);
        }

        // Select the largest video file (or all if we can't find video)
        await rdApi.post(`/torrents/selectFiles/${torrentId}`, `files=${bestVideoIdx}`, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        // 3. Poll until ready (up to 15s)
        let downloadLink = null;
        for (let i = 0; i < 7; i++) {
          await new Promise(r => setTimeout(r, 2000 + (i * 500)));
          const pollRes = await rdApi.get(`/torrents/info/${torrentId}`);
          const pollInfo = pollRes.data;

          if (pollInfo?.status === 'downloaded' && pollInfo?.links?.length > 0) {
            // Find the link matching our selected file
            const link = pollInfo.links.find(l => (l.id || '') === bestVideoIdx) || pollInfo.links[0];
            if (link) {
              const unrestrictRes = await rdApi.post('/unrestrict/link', `link=${encodeURIComponent(link)}`, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              });
              downloadLink = unrestrictRes.data?.download;
              if (downloadLink) break;
            }
          }

          if (pollInfo?.status === 'magnet_error' || pollInfo?.status === 'error') break;
        }

        // Clean up the torrent from RD
        await rdApi.delete(`/torrents/delete/${torrentId}`).catch(() => {});

        if (downloadLink) {
          return {
            url: downloadLink,
            quality: s.quality,
            name: s.title,
            source: 'realdebrid',
          };
        }
      } catch (err) {
        // If adding the magnet failed, this hash isn't on RD — skip
        if (err.response?.status === 403) break; // account issue
        continue;
      }
    }
    return null;
  }

  // Try TorBox as fallback
  async function resolveViaTorBox(streams, tbKey, targetEpisode) {
    if (!tbKey) return null;

    // Limit to first 5 streams to avoid long timeouts
    const candidates = streams.slice(0, 5);

    for (const s of candidates) {
      try {
        // Add magnet to TorBox (add_only_if_cached=true — won't download uncached)
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
        if (!torrentId) continue;

        // Wait for TorBox to process (poll up to 10s)
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const listRes = await axios.get(`${TORBOX_API}/torrents/mylist`, {
            params: { id: torrentId, bypass_cache: true },
            headers: { Authorization: `Bearer ${tbKey}` },
            timeout: 8000,
          });
          const item = listRes.data?.data;
          if (!item) continue;

          if (item.download_present) {
            // Find the best video file
            const files = item.files || [];
            let bestFileIdx = 0;
            let bestSize = 0;

            for (const f of files) {
              const fSize = parseInt(f.size) || 0;
              const isVideo = (f.mimetype || '').startsWith('video/');
              if (!isVideo) continue;

              // For TV shows, match episode number in the filename
              if (targetEpisode) {
                const fname = (f.path || f.short_name || '').toUpperCase();
                const epMatch = `E${String(targetEpisode).padStart(2, '0')}`;
                if (fname.includes(epMatch)) {
                  // Exact episode match — prefer this over anything else
                  bestFileIdx = typeof f.id === 'number' ? f.id : parseInt(f.id) || 0;
                  bestSize = Infinity; // Force this to be selected
                }
              } else if (fSize > bestSize) {
                // Movie — just pick largest
                bestSize = fSize;
                bestFileIdx = typeof f.id === 'number' ? f.id : parseInt(f.id) || 0;
              }
            }

            const dlRes = await axios.get(`${TORBOX_API}/torrents/requestdl`, {
              params: { token: tbKey, torrent_id: torrentId, file_id: bestFileIdx, redirect: false },
              timeout: 15000,
            });

            const url = dlRes.data?.data;
            if (url) {
              return { url, quality: s.quality, name: s.name || s.title, source: 'torbox' };
            }
            break;
          }

          if (item.download_failed) break;
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
      let streams = await scrapeTorrentio(tmdb_id, type, season, episode);

      // 1b. Fallback: if Torrentio returns nothing, search Pirate Bay
      if (streams.length === 0) {
        try {
          const tmdbRes = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdb_id}`, {
            params: { language: 'en-US' },
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            timeout: 5000,
          });
          const title = tmdbRes.data?.title || tmdbRes.data?.name || '';
          const year = (tmdbRes.data?.release_date || tmdbRes.data?.first_air_date || '').split('-')[0];
          streams = await scrapePirateBay(title, year, type, season, episode);
        } catch {
          // TMDB lookup failed, proceed without fallback
        }
      }

      if (streams.length === 0) {
        return res.json({ available: false, reason: 'No torrent sources found for this title' });
      }

      // 2. Try Real-Debrid first (fastest, most reliable)
      if (rdKey) {
        const rdResult = await resolveViaRealDebrid(streams, rdKey);
        if (rdResult) {
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
        const tbResult = await resolveViaTorBox(streams, tbKey);
        if (tbResult) {
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
