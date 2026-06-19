import { api, sanitize } from './api.js';
import { renderCard } from './templates.js';
import { getWatchHistory, saveWatchHistory, saveRecentlyViewed } from './storage.js';
import { user } from './auth.js';

let currentTmdbId = null;
let currentMediaType = null;
let currentSeason = null;
let currentEpisode = null;
let currentSources = [];
let currentSourceIdx = 0;
let currentItem = null;
let _muted = false;
let _volume = 1;

const SOURCE_LOAD_TIMEOUT = 8000;   // ms to wait per source before bailing
const SOURCE_FINAL_TIMEOUT = 30000; // ms total before giving up entirely

export function getPlayerState() {
  return { currentTmdbId, currentMediaType, currentSeason, currentEpisode, currentItem };
}

export function stopPlayer() {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  clearTimeout(window._nextEpOfferTimer);
  if (window._embedMessageHandler) {
    window.removeEventListener('message', window._embedMessageHandler);
    window._embedMessageHandler = null;
  }
  window._userSelectedSource = false;
  cancelCountdown();
  const container = document.getElementById('player-container');
  const loading = document.getElementById('stream-loading');
  const noStreams = document.getElementById('no-streams');
  const serverList = document.getElementById('server-list');
  const tvSelector = document.getElementById('tv-selector');
  const iframe = document.getElementById('player-iframe');
  if (container) container.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (noStreams) noStreams.style.display = 'none';
  if (serverList) serverList.style.display = 'none';
  if (tvSelector) tvSelector.style.display = 'none';
  if (iframe) iframe.src = 'about:blank';
  currentSources = [];
  currentSourceIdx = 0;
}

export async function playContent(tmdbId, type, showToastFn, showPageFn) {
  showToastFn = showToastFn || window.showToast;
  showPageFn = showPageFn || window.showPage;
  currentTmdbId = tmdbId;
  currentMediaType = type;
  window._currentTmdbId = tmdbId;
  window._currentMediaType = type;
  stopPlayer();
  saveRecentlyViewed({ tmdb_id: tmdbId, type, timestamp: Date.now() });

  try {
    const [item, info] = await Promise.all([
      api(`/tmdb/${tmdbId}?type=${type}`),
      user ? api(`/content/${tmdbId}`).catch(() => ({})) : Promise.resolve({}),
    ]);
    if (!item || !item.title) throw new Error('Title not found');
    currentItem = { tmdb_id: tmdbId, type, title: item.title, poster_url: item.poster_url, release_year: item.release_year };
    window._currentItem = currentItem;

    const safeTitle = sanitize(item.title || '');
    const safeDesc = item.description ? sanitize(item.description.substring(0, 280)) : '';
    const safeGenre = item.genre ? sanitize(item.genre) : '';

    let html = `<div class="player-meta"><h2>${safeTitle}</h2><div class="meta-row">`;
    if (item.release_date) html += `<span>${sanitize(item.release_date)}</span>`;
    if (safeGenre) html += `<span>${safeGenre}</span>`;
    if (item.vote_average) html += `<span class="meta-rating">★ ${item.vote_average.toFixed(1)}</span>`;
    html += `</div>`;
    if (safeDesc) html += `<p class="meta-desc">${safeDesc}</p>`;

    if (item.cast?.length > 0) {
      html += `<div class="player-section"><h3 class="player-section-title">Cast</h3><div class="cast-grid">`;
      item.cast.forEach(c => {
        const photo = c.photo ? `<img src="${sanitize(c.photo)}" alt="${sanitize(c.name)}" loading="lazy">` : '<div style="width:80px;height:80px;border-radius:50%;background:#1a1a2e;display:flex;align-items:center;justify-content:center;font-size:1.5rem">👤</div>';
        html += `<div class="cast-card">${photo}<p class="cast-name">${sanitize(c.name)}</p><p>${sanitize(c.character || '')}</p></div>`;
      });
      html += `</div></div>`;
    }

    if (item.similar?.length > 0) {
      html += `<div class="player-section"><h3 class="player-section-title">You May Also Like</h3><div class="similar-row">`;
      item.similar.forEach(s => { html += renderCard(s); });
      html += `</div></div>`;
    }

    html += `<div class="player-section" style="display:flex;gap:10px;flex-wrap:wrap">
      ${user ? `<button class="fav-btn" data-action="fav-toggle">${info.is_favorite ? '❤️ Remove Favorite' : '♡ Add to Favorites'}</button>` : ''}
      <button class="fav-btn" data-action="share">🔗 Share</button>
      <button class="fav-btn" data-action="trailer">🎬 Trailer</button>
    </div></div>`;
    document.getElementById('player-info').innerHTML = html;

    if (user) {
      const favBtn = document.querySelector('[data-action="fav-toggle"]');
      if (favBtn) favBtn.addEventListener('click', () => window.toggleFavorite(tmdbId, item.title, item.poster_url || '', type, item.release_year || null));
    }
    document.querySelector('[data-action="share"]')?.addEventListener('click', () => window.shareTitle(tmdbId, item.title, type));
    document.querySelector('[data-action="trailer"]')?.addEventListener('click', () => window.showTrailer(item.title));

    showPageFn('player');

    if (type === 'tv' && item.seasons?.length > 0) {
      const seasonSel = document.getElementById('season-select');
      seasonSel.innerHTML = item.seasons.map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`).join('');
      document.getElementById('tv-selector').style.display = 'block';
      currentSeason = item.seasons[0].season_number;
      await loadEpisodes();
      return;
    }

    await loadEmbedSources(tmdbId, type);
    window.loadPlayerExtras?.(tmdbId, type);
    window.loadComments?.(tmdbId, type);
  } catch (e) {
    document.getElementById('stream-loading').style.display = 'none';
    document.getElementById('player-container').style.display = 'none';
    document.getElementById('no-streams').style.display = 'flex';
    showToastFn?.('Could not load this title', 'error');
  }
}

async function loadEpisodes() {
  const seasonNum = parseInt(document.getElementById('season-select').value);
  currentSeason = seasonNum;
  try {
    const data = await api(`/tmdb/${currentTmdbId}/season/${seasonNum}`);
    const epiSel = document.getElementById('episode-select');
    epiSel.innerHTML = data.episodes.map(ep => `<option value="${ep.episode_number}">Ep ${ep.episode_number}: ${sanitize(ep.title)}</option>`).join('');
    currentEpisode = data.episodes[0]?.episode_number;
  } catch(e) { console.warn('[PS]', e); }
}

export async function playTVEpisode() {
  const season = parseInt(document.getElementById('season-select').value);
  const episode = parseInt(document.getElementById('episode-select').value);
  currentSeason = season;
  currentEpisode = episode;
  await loadEmbedSources(currentTmdbId, 'tv', season, episode);
}

export function prevEpisode() {
  const epSel = document.getElementById('episode-select');
  const current = parseInt(epSel.value);
  if (current > 1) { epSel.value = current - 1; playTVEpisode(); }
}

export function nextEpisode() {
  const epSel = document.getElementById('episode-select');
  const current = parseInt(epSel.value);
  const max = epSel.options.length;
  if (current < max) { epSel.value = current + 1; playTVEpisode(); }
}

let countdownTimer = null;

export function cancelCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  const el = document.getElementById('next-ep-countdown');
  if (el) el.style.display = 'none';
}

export function playNextEpisode() {
  cancelCountdown();
  nextEpisode();
}

function scheduleNextEpisodeOffer() {
  if (currentMediaType !== 'tv') return;
  const epSel = document.getElementById('tv-selector')?.style.display !== 'none' ? document.getElementById('episode-select') : null;
  if (!epSel || epSel.style.display === 'none') return;
  const current = parseInt(epSel.value, 10);
  const max = epSel.options.length;
  if (current >= max) return;
  cancelCountdown();
  const el = document.getElementById('next-ep-countdown');
  const span = document.getElementById('countdown-seconds');
  if (!el || !span) return;
  el.style.display = 'block';
  let left = 12;
  span.textContent = left;
  countdownTimer = setInterval(() => {
    left -= 1;
    span.textContent = left;
    if (left <= 0) {
      cancelCountdown();
      nextEpisode();
    }
  }, 1000);
}

export function toggleFullscreen() {
  const wrapper = document.querySelector('.player-wrapper');
  if (!document.fullscreenElement) {
    (wrapper.requestFullscreen || wrapper.webkitRequestFullscreen || (()=>{})).call(wrapper);
  } else {
    document.exitFullscreen?.();
  }
}

export function togglePip() {
  const iframe = document.getElementById('player-iframe');
  if (!iframe) return;
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else if (iframe.requestPictureInPicture) {
    iframe.requestPictureInPicture().catch(() => {});
  }
}

export function toggleTheater() {
  const container = document.querySelector('.player-container');
  if (!container) return;
  container.classList.toggle('theater');
  if (container.classList.contains('theater')) {
    container.style.maxHeight = '90vh';
  } else {
    container.style.maxHeight = '';
  }
}

export function sendAudioToIframe() {
  try {
    document.getElementById('player-iframe')?.contentWindow?.postMessage(
      { type: 'setVolume', volume: _volume, muted: _muted }, '*'
    );
  } catch(e) {}
}

export function setVolume(val) {
  _volume = parseFloat(val);
  _muted = _volume === 0;
  sendAudioToIframe();
  updateVolumeUI();
}

export function toggleMute() {
  _muted = !_muted;
  sendAudioToIframe();
  document.getElementById('chrome-volume').value = _muted ? 0 : _volume;
  updateVolumeUI();
}

function updateVolumeUI() {
  const btn = document.getElementById('chrome-mute-btn');
  if (btn) btn.textContent = _muted || _volume === 0 ? '🔇' : _volume < 0.5 ? '🔉' : '🔊';
}

async function loadEmbedSources(tmdbId, type, season, episode) {
  document.getElementById('stream-loading').style.display = 'flex';
  document.getElementById('player-container').style.display = 'none';
  document.getElementById('no-streams').style.display = 'none';
  document.getElementById('player-iframe').src = 'about:blank';
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  if (window._embedMessageHandler) {
    window.removeEventListener('message', window._embedMessageHandler);
    window._embedMessageHandler = null;
  }

  try {
    let url = `/embed/${tmdbId}?type=${type}`;
    if (season) url += `&season=${season}`;
    if (episode) url += `&episode=${episode}`;
    const data = await api(url);
    document.getElementById('stream-loading').style.display = 'none';

    const sources = data.sources || [];
    if (!sources.length) {
      document.getElementById('no-streams').style.display = 'flex';
      return;
    }

    currentSources = sources;
    currentSourceIdx = 0;
    window._userSelectedSource = false;

    const serverBtns = document.getElementById('server-buttons');
    const serverList = document.getElementById('server-list');
    if (serverBtns && serverList) {
      serverBtns.innerHTML = sources.map((s, i) => {
        const dot = s.confidence === 'high' ? '🟢' : s.confidence === 'medium' ? '🟡' : s.confidence === 'low' ? '🔴' : '⚪';
        return `<button class="server-btn${i === 0 ? ' active' : ''}" data-idx="${i}">${dot} ${sanitize(s.name)}</button>`;
      }).join('');
      serverList.style.display = 'block';
      serverBtns.querySelectorAll('.server-btn').forEach(btn => {
        btn.onclick = () => {
          window._userSelectedSource = true;
          currentSourceIdx = parseInt(btn.dataset.idx);
          tryServer(currentSourceIdx);
        };
      });
    }

    // Try the highest-confidence source first. Server already sorted them.
    tryServer(0);
    saveToWatchHistory(tmdbId, type, season, episode, currentItem?.title || '');
  } catch (e) {
    console.error('[PS] loadEmbedSources failed:', e);
    document.getElementById('stream-loading').style.display = 'none';
    document.getElementById('no-streams').style.display = 'flex';
  }
}

// Try a specific source index. Sets up load+timeout logic.
// On failure (no iframe response in SOURCE_LOAD_TIMEOUT), advance to next source.
// If user manually clicked a server, don't auto-advance — they picked it.
function tryServer(idx) {
  // CRITICAL: tear down ALL state from previous attempt before starting a new one.
  clearTimeout(window._sourceLoadTimer);
  if (window._embedMessageHandler) {
    window.removeEventListener('message', window._embedMessageHandler);
    window._embedMessageHandler = null;
  }
  // Clear final timer too — only set fresh on the first try.
  clearTimeout(window._sourceFinalTimer);
  window._sourceFinalTimer = null;

  const source = currentSources[idx];
  if (!source) {
    showNoStreams();
    return;
  }

  currentSourceIdx = idx;
  document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.server-btn[data-idx="${idx}"]`)?.classList.add('active');

  document.getElementById('player-container').style.display = 'block';
  document.getElementById('player-chrome').style.display = 'block';

  const iframe = document.getElementById('player-iframe');
  const loadingEl = document.getElementById('stream-loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `<div class="loading-text">Loading from ${sanitize(source.name)}...</div>`;
  }

  // Reset iframe src to about:blank first so onload fires reliably when we set the real src.
  iframe.src = 'about:blank';
  iframe.onload = null;
  iframe.onerror = null;

  // Use rAF to ensure the about:blank load settles before assigning real src.
  // This guarantees onload fires when the embed actually loads.
  requestAnimationFrame(() => {
    iframe.src = `/api/embed/proxy?url=${encodeURIComponent(source.url)}`;
  });

  // Per-source load timer: if the iframe hasn't fired load or ready in 8s, advance.
  let resolved = false;
  const resolveSuccess = () => {
    if (resolved) return;
    resolved = true;
    clearTimeout(window._sourceLoadTimer);
    clearTimeout(window._sourceFinalTimer);
    window._sourceFinalTimer = null;
    if (loadingEl) loadingEl.style.display = 'none';
    if (currentMediaType === 'tv') {
      window._nextEpOfferTimer = setTimeout(scheduleNextEpisodeOffer, 8 * 60 * 1000);
    }
    if (window._embedMessageHandler) {
      window.removeEventListener('message', window._embedMessageHandler);
      window._embedMessageHandler = null;
    }
  };
  window._resolveSuccess = resolveSuccess;

  const advance = () => {
    if (resolved) return;
    resolved = true;
    clearTimeout(window._sourceLoadTimer);
    if (window._embedMessageHandler) {
      window.removeEventListener('message', window._embedMessageHandler);
      window._embedMessageHandler = null;
    }
    // Don't auto-advance if user picked this server.
    if (window._userSelectedSource) return;
    advanceToNextSource();
  };
  window._advanceFromSource = advance;

  window._sourceLoadTimer = setTimeout(() => {
    // If user picked this server, give them more time. Otherwise advance.
    if (window._userSelectedSource) return;
    advance();
  }, SOURCE_LOAD_TIMEOUT);

  // Final timer — only set on the first source attempt.
  // Once any source succeeds, it's cleared.
  window._sourceFinalTimer = setTimeout(() => {
    if (resolved) return;
    if (window._userSelectedSource) return;
    // We've exhausted our time budget. Stop cycling.
    showNoStreams();
  }, SOURCE_FINAL_TIMEOUT);

  // Listen for embed-reported errors via postMessage.
  // CRITICAL: only attach ONE listener, scoped to this attempt. Detach on success/advance.
  const onMessage = (e) => {
    if (resolved) return;
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    // Player reported an error.
    if (data.type === 'embed-error' || data.type === 'ps-error' || data.event === 'error') {
      advance();
      return;
    }
    // Player reported ready — settle on this source.
    if (data.type === 'embed-ready' || data.type === 'ps-ready' || data.event === 'ready') {
      resolveSuccess();
      return;
    }
  };
  window._embedMessageHandler = onMessage;
  window.addEventListener('message', onMessage);

  // CRITICAL: do NOT treat iframe.onload as success.
  // Cross-origin embeds fire onload even when the player is broken.
  // We wait for either:
  //   1. postMessage 'embed-ready' (most reliable)
  //   2. SOURCE_LOAD_TIMEOUT (8s) — advance to next source
  //   3. SOURCE_FINAL_TIMEOUT (30s) — give up entirely
  //
  // We do NOT rely on iframe.onload anymore. The iframe might "load" but show an error inside.
  iframe.onload = () => {
    // Just hide the loading spinner — but DO NOT mark as resolved.
    // The SOURCE_LOAD_TIMER is the real gate.
    if (loadingEl) loadingEl.style.display = 'none';
  };
  iframe.onerror = () => {
    advance();
  };
}

function advanceToNextSource() {
  if (currentSources.length === 0) return showNoStreams();
  const nextIdx = (currentSourceIdx + 1) % currentSources.length;
  if (nextIdx === currentSourceIdx) return showNoStreams(); // only one source
  // CRITICAL: clear resolved state via the flag inside tryServer.
  // The flag is set per-attempt, so a fresh tryServer(nextIdx) resets it.
  tryServer(nextIdx);
}

function showNoStreams() {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  document.getElementById('stream-loading').style.display = 'none';
  document.getElementById('no-streams').style.display = 'flex';
}

function saveToWatchHistory(tmdbId, type, season, episode, title = '') {
  const watchHistory = getWatchHistory();
  const existing = watchHistory.findIndex(h => h.tmdbId === tmdbId && h.type === type);
  if (existing >= 0) watchHistory.splice(existing, 1);
  watchHistory.unshift({
    tmdbId, type, season, episode, title,
    poster_url: currentItem?.poster_url || null,
    timestamp: Date.now(),
    progress_pct: 15,
  });
  saveWatchHistory(watchHistory);
  window.updateContinueNav?.();

  if (user) {
    api(`/content/${tmdbId}/progress`, {
      method: 'POST',
      body: JSON.stringify({
        progress_seconds: 30, completed: 1,
        season_number: season || null, episode_number: episode || null,
        title: currentItem?.title || title, poster_url: currentItem?.poster_url || null,
        media_type: type,
      }),
    }).then(result => {
      if (result?.unlocked_achievements?.length) {
        for (const ach of result.unlocked_achievements) {
          window.showToast(`⚡ ${ach.name}! +1 🦚`, 'success', 4500);
        }
      }
    }).catch(() => {});
  }
}