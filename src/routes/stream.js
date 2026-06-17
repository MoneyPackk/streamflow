const express = require('express');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');

const RD_API = 'https://api.real-debrid.com/rest/1.0';
const TORRENTIO = 'https://torrentio.strem.fun';

function streamRoutes() {
  const router = express.Router();

  // Resolve stream for a tmdb_id
  router.get('/:tmdb_id', authenticate, async (req, res) => {
    try {
      const { tmdb_id } = req.params;
      const { type = 'movie', season, episode } = req.query;
      const rdKey = process.env.RD_API_KEY;

      let torrentioUrl;
      if (type === 'tv' && season && episode) {
        torrentioUrl = `${TORRENTIO}/stream/series/${tmdb_id}:${season}:${episode}.json`;
      } else {
        torrentioUrl = `${TORRENTIO}/stream/${type}/${tmdb_id}.json`;
      }

      const { data } = await axios.get(torrentioUrl, { timeout: 15000 });

      if (!data || !data.streams || data.streams.length === 0) {
        return res.status(404).json({ error: 'No streams found' });
      }

      // Parse streams and find best quality
      const streams = data.streams.map(s => {
        const match = s.title ? s.title.match(/(\d{3,4})p/) : null;
        const quality = match ? parseInt(match[1]) : 0;
        // Extract infoHash and fileIdx from s.infoHash
        let infoHash = null;
        let fileIdx = 0;
        if (s.infoHash) {
          infoHash = s.infoHash;
          fileIdx = parseInt(s.fileIdx) || 0;
        }
        return { ...s, quality, infoHash, fileIdx };
      });

      // Sort by quality descending (4K > 1080p > 720p)
      streams.sort((a, b) => b.quality - a.quality);
      const best = streams[0];

      // If no RD key or stream isn't RD-based, return the URL directly
      if (!rdKey) {
        return res.json({ url: best.url, quality: best.quality, name: best.title, infoHash: best.infoHash });
      }

      // For RD streams, unrestrict the link
      if (best.infoHash) {
        try {
          // Add magnet to RD
          const magnet = `magnet:?xt=urn:btih:${best.infoHash}`;
          const addRes = await axios.post(
            `${RD_API}/torrents/addMagnet`,
            `magnet=${encodeURIComponent(magnet)}`,
            { headers: { Authorization: `Bearer ${rdKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
          );

          const torrentId = addRes.data.id;

          // Select files
          await axios.post(
            `${RD_API}/torrents/selectFiles/${torrentId}`,
            `files=${best.fileIdx || 'all'}`,
            { headers: { Authorization: `Bearer ${rdKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
          );

          // Wait for RD to process (non-blocking, with timeout)
          let rdInfo;
          const pollStart = Date.now();
          const POLL_TIMEOUT = 15000;
          for (let i = 0; i < 10; i++) {
            if (Date.now() - pollStart > POLL_TIMEOUT) break;
            await new Promise(r => setTimeout(r, 1000));
            const infoRes = await axios.get(`${RD_API}/torrents/info/${torrentId}`, {
              headers: { Authorization: `Bearer ${rdKey}` }, timeout: 8000
            });
            rdInfo = infoRes.data;
            if (rdInfo.status === 'downloaded' && rdInfo.links?.length > 0) break;
            if (rdInfo.status === 'magnet_conversion' && rdInfo.links?.length > 0) break;
          }

          if (!rdInfo || !rdInfo.links || rdInfo.links.length === 0) {
            // Fallback: try using best.url directly as fallback
            if (best.url) return res.json({ url: best.url, quality: best.quality, name: best.title });
            return res.status(500).json({ error: 'RD processing timeout' });
          }

          // Unrestrict the first link
          const linkRes = await axios.post(
            `${RD_API}/unrestrict/link`,
            `link=${encodeURIComponent(rdInfo.links[0])}`,
            { headers: { Authorization: `Bearer ${rdKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
          );

          return res.json({
            url: linkRes.data.download,
            quality: best.quality,
            name: best.title || best.name,
            filename: linkRes.data.filename,
            filesize: linkRes.data.filesize,
          });
        } catch (rdErr) {
          // RD failed, fallback to direct URL if available
          if (best.url) return res.json({ url: best.url, quality: best.quality, name: best.title });
          return res.status(500).json({ error: 'RD error: ' + (rdErr.response?.data?.error || rdErr.message) });
        }
      }

      // Non-RD stream (direct URL)
      if (best.url) return res.json({ url: best.url, quality: best.quality, name: best.title });
      return res.status(404).json({ error: 'No playable stream found' });
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({ error: 'No streams available for this content' });
      }
      res.status(500).json({ error: 'Stream resolution failed: ' + (err.response?.data?.error || err.message) });
    }
  });

  return router;
}

module.exports = streamRoutes;
