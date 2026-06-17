import { api, sanitize } from './api.js';
import { renderCard } from './templates.js';
import { getWatchHistory, saveWatchHistory, saveRecentlyViewed } from './storage.js';
import { user } from './auth.js';

let currentTmdbId = null;
let currentMediaType = null;
let currentSeason = null;
let currentEpisode = null;
let currentSources = [];
let currentItem = null;
let _muted = false;
let _volume = 1;

export function getPlayerState() {
  return { currentTmdbId, currentMediaType, currentSeason, currentEpisode, currentItem };
}

export function stopPlayer() {
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
}

export async function playContent(tmdbId, type, showToastFn, showPageFn) {
  currentTmdbId = tmdbId;
  currentMediaType = type;
  stopPlayer();
  saveRecentlyViewed({ tmdb_id: tmdbId, type, timestamp: Date.now() });

  try {
    const [item, info] = await Promise.all([
      api(`/tmdb/${tmdbId}?type=${type}`),
      user ? api(`/content/${tmdbId}`).catch(() => ({})) : Promise.resolve({}),
    ]);
    if (!item || !item.title) throw new Error('Title not found');
    currentItem = { tmdb_id: tmdbId, type, title: item.title, poster_url: item.poster_url };

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
  clearTimeout(window._sourceRetryTimer);

  try {
    let url = `/embed/${tmdbId}?type=${type}`;
    if (season) url += `&season=${season}`;
    if (episode) url += `&episode=${episode}`;
    const { sources } = await api(url);
    document.getElementById('stream-loading').style.display = 'none';

    if (!sources?.length) {
      document.getElementById('no-streams').style.display = 'flex';
      return;
    }

    currentSources = sources;
    const bestIdx = 0;

    const serverBtns = document.getElementById('server-buttons');
    const serverList = document.getElementById('server-list');
    if (serverBtns && serverList) {
      serverBtns.innerHTML = sources.map((s, i) => {
        return `<button class="server-btn${i === bestIdx ? ' active' : ''}" data-idx="${i}">Peacock Source ${i + 1}</button>`;
      }).join('');
      serverList.style.display = 'block';
      serverBtns.querySelectorAll('.server-btn').forEach(btn => {
        btn.onclick = () => { clearTimeout(window._sourceRetryTimer); switchServer(parseInt(btn.dataset.idx)); };
      });
    }
    switchServer(bestIdx);
    saveToWatchHistory(tmdbId, type, season, episode, currentItem?.title || '');
  } catch {
    document.getElementById('stream-loading').style.display = 'none';
    document.getElementById('no-streams').style.display = 'flex';
  }
}

function switchServer(idx) {
  clearTimeout(window._sourceRetryTimer);
  document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.server-btn[data-idx="${idx}"]`)?.classList.add('active');
  const source = currentSources[idx];
  if (!source) return;
  document.getElementById('player-container').style.display = 'block';
  document.getElementById('player-chrome').style.display = 'block';
  document.getElementById('player-iframe').src = source.url;
  if (currentSources.length > 1) {
    window._sourceRetryTimer = setTimeout(() => {
      const nextIdx = (idx + 1) % currentSources.length;
      if (nextIdx !== idx) switchServer(nextIdx);
    }, 8000);
  }
}

function saveToWatchHistory(tmdbId, type, season, episode, title = '') {
  const watchHistory = getWatchHistory();
  const existing = watchHistory.findIndex(h => h.tmdbId === tmdbId && h.type === type);
  if (existing >= 0) watchHistory.splice(existing, 1);
  watchHistory.unshift({ tmdbId, type, season, episode, title, poster_url: currentItem?.poster_url || null, timestamp: Date.now() });
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
