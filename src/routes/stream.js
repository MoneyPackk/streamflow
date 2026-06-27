  // Try TorBox as fallback
  async function resolveViaTorBox(streams, tbKey) {
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
            // Find the largest video file
            const files = item.files || [];
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