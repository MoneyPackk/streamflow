const express = require('express');
const axios = require('axios');

const TORBOX_API = 'https://api.torbox.app/v1/api';
const TORRENTIO = 'https://torrentio.strem.fun';

function streamRoutes() {
  const router = express.Router();

  // Resolve stream for a tmdb_id using TorBox
  // No authentication required — the server's TorBox API key handles it
  router.get('/:tmdb_id', async (req, res) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;
      const tbKey = process.env.TORBOX_API_KEY;

      if (!tbKey) {
        return res.json({ available: false, reason: 'TORBOX_API_KEY not configured. Add TORBOX_API_KEY to .env' });
      }

      let torrentioUrl;
      if (type === 'tv' && season && episode) {
        torrentioUrl = `${TORRENTIO}/stream/series/${tmdb_id}:${season}:${episode}.json`;
      } else {
        torrentioUrl = `${TORRENTIO}/stream/${type}/${tmdb_id}.json`;
      }

      const { data } = await axios.get(torrentioUrl, { timeout: 15000 });

      if (!data || !data.streams || data.streams.length === 0) {
        return res.json({ available: false, reason: 'No torrents found' });
      }

      // Parse streams, find the best quality with an infoHash
      const streams = data.streams
        .filter(s => s.infoHash)
        .map(s => {
          const match = s.title ? s.title.match(/(\d{3,4})p/) : null;
          return {
            quality: match ? parseInt(match[1]) : 0,
            infoHash: s.infoHash,
            fileIdx: parseInt(s.fileIdx) || 0,
            title: s.title || s.name || '',
            name: s.name || '',
          };
        })
        .sort((a, b) => b.quality - a.quality);

      if (streams.length === 0) {
        return res.json({ available: false, reason: 'No torrents with usable infoHash found' });
      }

      const best = streams[0];

      // Check if TorBox has this hash cached
      const cachedRes = await axios.get(`${TORBOX_API}/torrents/checkcached`, {
        params: { hash: best.infoHash, format: 'object', list_files: true },
        headers: { Authorization: `Bearer ${tbKey}` },
        timeout: 10000,
      });

      const cacheData = cachedRes.data?.data;
      const isCached = cacheData && cacheData[best.infoHash];

      if (!isCached) {
        // Not cached — try to add with add_only_if_cached=true.
        // If TorBox doesn't have it cached, it won't add it.
        try {
          const magnet = `magnet:?xt=urn:btih:${best.infoHash}`;
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

          // If added successfully, get the torrent ID
          const torrentId = addRes.data?.data?.torrent_id;
          if (torrentId) {
            // Wait for TorBox to process (poll every 2s, max 10s)
            const pollStart = Date.now();
            for (let i = 0; i < 5; i++) {
              await new Promise(r => setTimeout(r, 2000));
              const listRes = await axios.get(`${TORBOX_API}/torrents/mylist`, {
                params: { id: torrentId, bypass_cache: true },
                headers: { Authorization: `Bearer ${tbKey}` },
                timeout: 8000,
              });
              const item = listRes.data?.data;
              if (item?.download_present) break;
            }

            // Get the download link
            const dlRes = await axios.get(`${TORBOX_API}/torrents/requestdl`, {
              params: {
                token: tbKey,
                torrent_id: torrentId,
                file_id: best.fileIdx || 0,
                redirect: false,
              },
              timeout: 15000,
            });

            const downloadUrl = dlRes.data?.data;
            if (downloadUrl) {
              return res.json({
                url: downloadUrl,
                quality: best.quality,
                name: best.title,
              });
            }
          }
        } catch (addErr) {
          // TorBox might not have it cached — return unavailable
          console.error('[Stream] TorBox add error:', addErr.response?.status, addErr.message);
        }

        return res.json({ available: false, reason: 'Not available on TorBox. Try the embed sources.' });
      }

      // Already cached — get download link directly
      const cachedInfo = cacheData[best.infoHash];
      const torrentId = cachedInfo.id;
      const fileId = best.fileIdx || 0;

      const dlRes = await axios.get(`${TORBOX_API}/torrents/requestdl`, {
        params: {
          token: tbKey,
          torrent_id: torrentId,
          file_id: fileId,
          redirect: false,
        },
        timeout: 15000,
      });

      const downloadUrl = dlRes.data?.data;
      if (!downloadUrl) {
        return res.json({ available: false, reason: 'Failed to get download link from TorBox' });
      }

      return res.json({
        url: downloadUrl,
        quality: best.quality,
        name: best.title,
      });
    } catch (err) {
      console.error('[Stream] Error:', err.response?.status, err.message);
      res.json({ available: false, reason: err.message || 'Stream resolution failed' });
    }
  });

  return router;
}

module.exports = streamRoutes;
