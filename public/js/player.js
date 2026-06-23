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

const SOURCE_LOAD_TIMEOUT = 12000;  // ms per source before advancing
const SOURCE_FINAL_TIMEOUT = 90000; // ms total before giving up

export function getPlayerState() {
  return { currentTmdbId, currentMediaType, currentSeason, currentEpisode, currentItem };
}

export function stopPlayer() {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  clearTimeout(window._nextEpOfferTimer);
  cancelCountdown();
  const container = document.getElementById('player-container');
  const loading = document.getElementById('stream-loading');
  const noStreams = document.getElementById('no-streams');
  const tvSelector = document.getElementById('tv-selector');
  const iframe = document.getElementById('player-iframe');
  const video = document.getElementById('direct-player');
  if (container) container.style.display = 'none';
  if (loading) loading.style.display = 'none';
  if (noStreams) noStreams.style.display = 'none';
  if (tvSelector) tvSelector.style.display = 'none';
  const retry = document.getElementById('source-retry');
  if (retry) retry.style.display = 'none';
  if (iframe) iframe.src = 'about:blank';
  if (video) { video.pause(); video.src = ''; video.style.display = 'none'; }
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
        const photo = c.photo ? `<img src="${sanitize(c.photo)}" alt="${sanitize(c.name)}" loading="lazy">` : '<div style="width:80px;height:80px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:1.5rem">👤</div>';
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
      ${user ? `<button class="fav-btn" data-action="fav-toggle">${info.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}</button>` : ''}
      <button class="fav-btn" data-action="share">Share</button>
      <button class="fav-btn" data-action="trailer">Trailer</button>
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

// Try TorBox direct stream first. If available, use <video> element.
// If not, fall back to embed providers.
async function tryTorBox(tmdbId, type, season, episode) {
  try {
    let url = `/api/stream/${tmdbId}?type=${type}`;
    if (season) url += `&season=${season}`;
    if (episode) url += `&episode=${episode}`;
    const data = await api(url);

    if (data && data.available !== false && data.url) {
      // TorBox has it — use direct <video> element
      document.getElementById('stream-loading').style.display = 'none';
      document.getElementById('player-container').style.display = 'block';
      document.getElementById('player-iframe').style.display = 'none';
      const video = document.getElementById('direct-player');
      video.style.display = 'block';
      video.src = data.url;
      video.play().catch(() => {});
      document.getElementById('player-chrome').style.display = 'block';
      // Show retry button in case the link fails
      const retry = document.getElementById('source-retry');
      if (retry) retry.style.display = 'none';
      saveToWatchHistory(tmdbId, type, season, episode, currentItem?.title || '');
      return true; // TorBox handled it
    }
  } catch (e) {
    console.warn('[PS] TorBox unavailable:', e.message);
  }
  return false; // Fall back to embeds
}

async function loadEmbedSources(tmdbId, type, season, episode) {
  document.getElementById('stream-loading').style.display = 'flex';
  document.getElementById('player-container').style.display = 'none';
  document.getElementById('no-streams').style.display = 'none';
  document.getElementById('player-iframe').src = 'about:blank';
  document.getElementById('direct-player').style.display = 'none';
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);

  // Try TorBox first
  const torBoxSuccess = await tryTorBox(tmdbId, type, season, episode);
  if (torBoxSuccess) return;

  // Hide the video player and show the iframe for embeds
  document.getElementById('direct-player').style.display = 'none';
  document.getElementById('player-iframe').style.display = 'block';

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

    // No source list shown to the user. Silent auto-cycling only.
    trySource(0);
    saveToWatchHistory(tmdbId, type, season, episode, currentItem?.title || '');
  } catch (e) {
    console.error('[PS] loadEmbedSources failed:', e);
    document.getElementById('stream-loading').style.display = 'none';
    document.getElementById('no-streams').style.display = 'flex';
  }
}

// Try a specific source. The load_url is our server-side redirect endpoint.
// On iframe.onload: treat as success (stop cycling, show player).
// On timeout (12s with no load): advance to next source.
// On total timeout (90s): give up.
function tryServer(idx) {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);

  const source = currentSources[idx];
  if (!source) {
    showNoStreams();
    return;
  }

  currentSourceIdx = idx;

  document.getElementById('player-container').style.display = 'block';
  document.getElementById('player-chrome').style.display = 'block';

  const iframe = document.getElementById('player-iframe');
  const loadingEl = document.getElementById('stream-loading');
  if (loadingEl) {
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = `<div class="spinner"></div><p class="loading-text">Loading...</p>`;
  }

  let resolved = false;

  const resolveSuccess = () => {
    if (resolved) return;
    resolved = true;
    clearTimeout(window._sourceLoadTimer);
    clearTimeout(window._sourceFinalTimer);
    if (loadingEl) loadingEl.style.display = 'none';
    // Show the subtle retry button in case the video isn't actually playing.
    const retry = document.getElementById('source-retry');
    if (retry && currentSources.length > 1) retry.style.display = 'block';
    if (currentMediaType === 'tv') {
      window._nextEpOfferTimer = setTimeout(scheduleNextEpisodeOffer, 8 * 60 * 1000);
    }
  };

  const advance = () => {
    if (resolved) return;
    resolved = true;
    clearTimeout(window._sourceLoadTimer);
    advanceToNextSource();
  };

  // Reset iframe, then load the source via our redirect endpoint.
  iframe.src = 'about:blank';
  iframe.onload = null;
  iframe.onerror = null;

  requestAnimationFrame(() => {
    iframe.src = source.load_url;
  });

  // When the iframe loads, hide the spinner and resolve as success.
  // Cross-origin iframes fire onload even when blocked, but the 4 providers
  // we use are verified to allow embedding. If a specific movie doesn't
  // have a stream, the provider page will show its own error within the
  // iframe. The user can click "try another source" to switch.
  iframe.onload = () => {
    resolveSuccess();
  };

  iframe.onerror = () => {
    advance();
  };

  // Per-source timeout: if no load in 12s, try next source.
  window._sourceLoadTimer = setTimeout(() => {
    advance();
  }, SOURCE_LOAD_TIMEOUT);

  // Final timeout: if we've been cycling for 90s, give up.
  window._sourceFinalTimer = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    clearTimeout(window._sourceLoadTimer);
    showNoStreams();
  }, SOURCE_FINAL_TIMEOUT);
}

function advanceToNextSource() {
  if (currentSources.length === 0) return showNoStreams();
  const nextIdx = currentSourceIdx + 1;
  if (nextIdx >= currentSources.length) return showNoStreams();
  tryServer(nextIdx);
}

// Manual "try another source" — user clicks if video isn't playing.
// No provider names shown. Just cycles to the next source silently.
export function tryNextSource() {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  const nextIdx = currentSourceIdx + 1;
  if (nextIdx >= currentSources.length) {
    // Wrap around to the beginning.
    if (currentSources.length > 0) {
      tryServer(0);
    } else {
      showNoStreams();
    }
    return;
  }
  tryServer(nextIdx);
}

function showNoStreams() {
  clearTimeout(window._sourceLoadTimer);
  clearTimeout(window._sourceFinalTimer);
  document.getElementById('stream-loading').style.display = 'none';
  document.getElementById('no-streams').style.display = 'flex';
  const retry = document.getElementById('source-retry');
  if (retry) retry.style.display = 'none';
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
          window.showToast(`Achievement unlocked: ${ach.name}`, 'success', 4500);
        }
      }
    }).catch(() => {});
  }
}
