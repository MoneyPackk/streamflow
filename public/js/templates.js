import { api, sanitize } from './api.js';
import { getWatchHistory, saveRecentlyViewed } from './storage.js';

export function renderSkeletons(count) {
  return Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}

export function renderCard(item) {
  const safeTitle = sanitize(item.title || '');
  const safeType = item.type === 'tv' ? 'tv' : 'movie';
  const poster = item.poster_url
    ? `<img src="${sanitize(item.poster_url)}" alt="${safeTitle}" loading="lazy">`
    : '<div class="poster-placeholder">🎬</div>';
  const badge = safeType === 'tv' ? '<span class="badge">TV</span>' : '<span class="badge">Movie</span>';
  const rating = item.vote_average ? `<span class="rating">★ ${item.vote_average.toFixed(1)}</span>` : '';
  const hd = item.vote_average >= 6 ? '<span class="hd-badge">HD</span>' : '';
  const isBeast = item.vote_average >= 8.0;
  const beast = isBeast ? '<span class="beast-badge">⚡ BEAST</span>' : '';
  const year = item.release_year ? `<span class="card-year">${item.release_year}</span>` : '';
  return `<div class="content-card ${isBeast ? 'beast-mode' : ''}" onclick="window.playContent(${Number(item.tmdb_id)}, '${safeType}')" onkeydown="if(event.key==='Enter')window.playContent(${Number(item.tmdb_id)},'${safeType}')" tabindex="0" role="button" aria-label="${safeTitle}">
    ${badge}${rating}${hd}${beast}
    <div class="poster">${poster}</div>
    <div class="info"><h3>${safeTitle}</h3><p>${year}</p></div>
  </div>`;
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
      : '<div class="poster" style="background:linear-gradient(135deg,#1a1a2e,#111);display:flex;align-items:center;justify-content:center;font-size:2.5rem">🎬</div>';
    const rating = item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : '';
    const is4K = item.vote_average >= 7.5;
    const isBeast = item.vote_average >= 8.0;
    const beastBadge = isBeast ? '<div class="beast-corner">⚡ BEAST</div>' : '';
    return `<div class="top-ten-card ${isBeast ? 'beast' : ''}" onclick="window.playContent(${Number(item.tmdb_id)}, '${item.type}')" onkeydown="if(event.key==='Enter')window.playContent(${Number(item.tmdb_id)},'${item.type}')" tabindex="0" role="button" aria-label="${sanitize(item.title)}">
      ${poster}
      <div class="rank">${rank}</div>
      ${is4K ? '<div class="hd-badge-4k">4K</div>' : ''}
      ${beastBadge}
      <div class="info-overlay">
        <h3>${sanitize(item.title || '')}</h3>
        <p>${rating} ${item.release_year || ''}</p>
      </div>
    </div>`;
  }).join('');
}

export function renderComment(c, showToastFn) {
  return `
    <div class="comment-item">
      <div class="comment-avatar">${sanitize(c.username[0]?.toUpperCase() || '?')}</div>
      <div class="comment-content">
        <div class="comment-header"><strong>${sanitize(c.username)}</strong><span>${timeAgo(c.created_at)}</span></div>
        <div class="comment-body">${sanitize(c.body)}</div>
        <div class="comment-actions">
          <button onclick="window.likeComment(${c.id}, this)" class="comment-like">${c.liked ? '❤️' : '🤍'} ${c.likes_count || 0}</button>
          <button onclick="window.replyComment(${c.id}, '${sanitize(c.username)}')">Reply</button>
        </div>
      </div>
    </div>`;
}

export function renderAchievement(key, ach, unlocked) {
  return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
    ${unlocked ? '<span class="ach-credit">+1 🦚</span>' : ''}
    <div class="ach-icon">${ach.icon}</div>
    <div class="ach-name">${sanitize(ach.name)}</div>
    <div class="ach-desc">${sanitize(ach.desc)}</div>
    ${!unlocked ? '<div class="ach-locked-overlay">🔒</div>' : ''}
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
