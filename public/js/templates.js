import { sanitize } from './api.js';

export function renderSkeletons(count) {
  return Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}

function cardClickHandler(tmdbId, type) {
  return `window.openDetail(${Number(tmdbId)}, '${type}')`;
}

export function renderCard(item) {
  const safeTitle = sanitize(item.title || '');
  const safeType = item.type === 'tv' ? 'tv' : 'movie';
  const poster = item.poster_url
    ? `<img src="${sanitize(item.poster_url)}" alt="${safeTitle}" loading="lazy">`
    : `<div class="poster-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>`;
  const badge = safeType === 'tv' ? '<span class="badge">TV</span>' : '<span class="badge">Movie</span>';
  const rating = item.vote_average ? `<span class="rating">★ ${item.vote_average.toFixed(1)}</span>` : '';
  const year = item.release_year ? `<span class="card-year">${item.release_year}</span>` : '';
  const desc = item.description || item.overview || '';
  const previewDesc = desc ? sanitize(desc.substring(0, 120)) + (desc.length > 120 ? '…' : '') : '';
  const progress = item.progress_pct ? `<div class="card-progress"><div class="card-progress-fill" style="width:${item.progress_pct}%"></div></div>` : '';

  return `<div class="content-card" data-tmdb="${Number(item.tmdb_id)}" data-type="${safeType}"
    onclick="${cardClickHandler(item.tmdb_id, safeType)}"
    onkeydown="if(event.key==='Enter')${cardClickHandler(item.tmdb_id, safeType)}"
    tabindex="0" role="button" aria-label="${safeTitle}">
    <div class="card-glare"></div>
    ${badge}${rating}${progress}
    <div class="poster">${poster}</div>
    <div class="card-hover-preview">
      <p class="preview-title">${safeTitle}</p>
      ${previewDesc ? `<p class="preview-desc">${previewDesc}</p>` : ''}
      <div class="preview-actions">
        <button class="preview-play" onclick="event.stopPropagation();window.playContent(${Number(item.tmdb_id)},'${safeType}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play
        </button>
        <button class="preview-info" onclick="event.stopPropagation();${cardClickHandler(item.tmdb_id, safeType)}">More Info</button>
      </div>
    </div>
    <div class="info"><h3>${safeTitle}</h3><p>${year}</p></div>
  </div>`;
}

export function renderContinueCard(item) {
  const enriched = {
    ...item,
    progress_pct: item.runtime_seconds > 0
      ? Math.min(100, Math.round((item.progress_seconds / item.runtime_seconds) * 100))
      : (item.progress_seconds > 60 ? 35 : 15),
  };
  return renderCard(enriched);
}

export function renderTopTen(items) {
  const filtered = items.filter(item => {
    const t = item.title || item.name || '';
    return /^[A-Za-z0-9\s\-\.,!?'"()&:;\u00C0-\u017F]+$/.test(t);
  });
  return filtered.map((item, i) => {
    const rank = String(i + 1).padStart(2, '0');
    const poster = item.poster_url
      ? `<img class="poster" src="${sanitize(item.poster_url)}" alt="${sanitize(item.title)}" loading="lazy">`
      : `<div class="poster" style="background:linear-gradient(135deg,#12121c,#08080d);display:flex;align-items:center;justify-content:center"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(192, 132, 252, 0.4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg></div>`;
    const rating = item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : '';
    const type = item.type === 'tv' ? 'tv' : 'movie';
    return `<div class="top-ten-card" onclick="window.openDetail(${Number(item.tmdb_id)},'${type}')" tabindex="0" role="button" aria-label="${sanitize(item.title)}">
      ${poster}
      <div class="rank">${rank}</div>
      ${item.vote_average >= 7.5 ? '<div class="hd-badge-4k">HD</div>' : ''}
      <div class="info-overlay">
        <h3>${sanitize(item.title || '')}</h3>
        <p>${rating} ${item.release_year || ''}</p>
      </div>
      <button class="top-ten-play" onclick="event.stopPropagation();window.playContent(${Number(item.tmdb_id)},'${type}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    </div>`;
  }).join('');
}

export function renderComment(c) {
  const likeIcon = c.liked
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
  
  return `
    <div class="comment-item">
      <div class="comment-avatar">${sanitize(c.username[0]?.toUpperCase() || '?')}</div>
      <div class="comment-content">
        <div class="comment-header"><strong>${sanitize(c.username)}</strong><span>${timeAgo(c.created_at)}</span></div>
        <div class="comment-body">${sanitize(c.body)}</div>
        <div class="comment-actions">
          <button onclick="window.likeComment(${c.id}, this)" class="comment-like">${likeIcon} ${c.likes_count || 0}</button>
          <button onclick="window.replyComment(${c.id}, '${sanitize(c.username)}')">Reply</button>
        </div>
      </div>
    </div>`;
}

export function renderAchievement(key, ach, unlocked) {
  const lockIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
  
  return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
    ${unlocked ? '<span class="ach-credit">+1 🦚</span>' : ''}
    <div class="ach-icon">${ach.icon}</div>
    <div class="ach-name">${sanitize(ach.name)}</div>
    <div class="ach-desc">${sanitize(ach.desc)}</div>
    ${!unlocked ? `<div class="ach-locked-overlay">${lockIcon}</div>` : ''}
  </div>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return dateStr;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
