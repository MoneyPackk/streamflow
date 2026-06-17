import { api, sanitize } from './api.js';
import { user } from './auth.js';

let detailItem = null;

export function getDetailItem() {
  return detailItem;
}

export async function openDetail(tmdbId, type) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return window.playContent?.(tmdbId, type);

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.detail-hero-content').innerHTML = '<p style="color:#888;padding:40px">Loading...</p>';

  try {
    const item = await api(`/tmdb/${tmdbId}?type=${type}`);
    detailItem = { ...item, tmdb_id: tmdbId, type };
    renderDetail(item, type, tmdbId);
  } catch {
    closeDetail();
    window.showToast?.('Could not load title', 'error');
  }
}

function renderDetail(item, type, tmdbId) {
  const safeTitle = sanitize(item.title || '');
  const backdrop = item.backdrop_url ? `url(${item.backdrop_url})` : 'none';
  const poster = item.poster_url
    ? `<img class="detail-poster" src="${sanitize(item.poster_url)}" alt="${safeTitle}">`
    : '<div class="detail-poster-placeholder">🎬</div>';

  const tags = [];
  if (item.release_year) tags.push(String(item.release_year));
  if (item.genre) tags.push(...item.genre.split(',').slice(0, 3).map(g => g.trim()));
  if (type === 'tv') tags.push('TV Series');
  else tags.push('Movie');
  if (item.vote_average) tags.push(`★ ${item.vote_average.toFixed(1)}`);

  const castHtml = (item.cast || []).slice(0, 8).map(c => `
    <div class="detail-cast-card">
      ${c.photo ? `<img src="${sanitize(c.photo)}" alt="${sanitize(c.name)}">` : '<div style="width:64px;height:64px;border-radius:50%;background:#1a1a2e;margin:0 auto 4px"></div>'}
      <span>${sanitize(c.name)}</span>
    </div>
  `).join('');

  document.querySelector('.detail-hero-bg').style.backgroundImage = backdrop;
  document.querySelector('.detail-hero-content').innerHTML = `
    ${poster}
    <div class="detail-meta">
      <h2>${safeTitle}</h2>
      <div class="detail-tags">${tags.map(t => `<span class="detail-tag">${sanitize(t)}</span>`).join('')}</div>
    </div>
  `;

  document.getElementById('detail-body').innerHTML = `
    <p class="detail-desc">${sanitize((item.description || 'No description available.').substring(0, 400))}</p>
    <div class="detail-actions">
      <button class="detail-btn detail-btn-play" id="detail-play-btn">▶ Play Now</button>
      <button class="detail-btn detail-btn-secondary" id="detail-trailer-btn">▶ Trailer</button>
      ${user ? `<button class="detail-btn detail-btn-secondary" id="detail-watchlist-btn">+ Watchlist</button>` : ''}
    </div>
    ${castHtml ? `<h4 style="font-size:.8rem;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Cast</h4><div class="detail-cast">${castHtml}</div>` : ''}
  `;

  document.getElementById('detail-play-btn').onclick = () => playFromDetail();
  document.getElementById('detail-trailer-btn').onclick = () => openTrailer(tmdbId, type);
  const wlBtn = document.getElementById('detail-watchlist-btn');
  if (wlBtn) {
    wlBtn.onclick = async () => {
      try {
        const res = await api(`/social/watchlist/${tmdbId}`, {
          method: 'POST',
          body: JSON.stringify({
            title: item.title, poster_url: item.poster_url,
            media_type: type, release_year: item.release_year,
          }),
        });
        window.showToast?.(res.action === 'added' ? 'Added to watchlist' : 'Removed from watchlist', 'success');
      } catch (e) { window.showToast?.(e.message, 'error'); }
    };
  }

  history.replaceState(null, '', `?${type}=${tmdbId}`);
}

export function closeDetail() {
  document.getElementById('detail-modal')?.classList.remove('open');
  document.body.style.overflow = '';
  detailItem = null;
}

export function playFromDetail() {
  if (!detailItem) return;
  const { tmdb_id, type } = detailItem;
  closeDetail();
  window.playContent?.(tmdb_id, type);
}

export async function openTrailer(tmdbId, type) {
  try {
    const data = await api(`/tmdb/${tmdbId}/videos?type=${type}`);
    const trailer = (data.videos || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')
      || (data.videos || []).find(v => v.site === 'YouTube');
    if (!trailer) {
      window.showToast?.('No trailer found', 'info');
      return;
    }
    const modal = document.getElementById('trailer-modal');
    const iframe = document.getElementById('trailer-iframe');
    iframe.src = `https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  } catch {
    window.showToast?.('Trailer unavailable', 'error');
  }
}

export function closeTrailer() {
  const modal = document.getElementById('trailer-modal');
  const iframe = document.getElementById('trailer-iframe');
  if (iframe) iframe.src = '';
  modal?.classList.remove('open');
  if (!document.getElementById('detail-modal')?.classList.contains('open')) {
    document.body.style.overflow = '';
  }
}

export function initDetailModal() {
  document.getElementById('detail-close')?.addEventListener('click', closeDetail);
  document.querySelector('.detail-backdrop')?.addEventListener('click', closeDetail);
  document.getElementById('trailer-close')?.addEventListener('click', closeTrailer);
  document.querySelector('.trailer-backdrop')?.addEventListener('click', closeTrailer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('trailer-modal')?.classList.contains('open')) closeTrailer();
      else if (document.getElementById('detail-modal')?.classList.contains('open')) closeDetail();
    }
  });
}
