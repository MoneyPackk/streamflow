import { api, sanitize, timeAgo } from './api.js';
import { renderCard, renderComment, renderContinueCard } from './templates.js';
import { user } from './auth.js';

export async function toggleFavorite(tmdbId, title, posterUrl, type, releaseYear) {
  try {
    const info = await api(`/content/${tmdbId}`);
    if (info.is_favorite) {
      await api(`/content/${tmdbId}/favorite`, { method: 'DELETE' });
      window.showToast(`Removed "${title}" from favorites`, 'info');
    } else {
      await api(`/content/${tmdbId}/favorite`, {
        method: 'POST',
        body: JSON.stringify({ title, poster_url: posterUrl || null, type, release_year: releaseYear })
      });
      window.showToast(`Added "${title}" to favorites`, 'success');
    }
    window.playContent(tmdbId, type);
  } catch (e) { window.showToast(e.message, 'error'); }
}

export async function loadPlayerExtras(tmdbId, type) {
  const extras = document.getElementById('player-extras');
  if (!extras) return;
  let myRating = null;
  let onWatchlist = false;
  let aggregate = null;
  try {
    const r = await api(`/social/ratings/${tmdbId}?type=${type}`);
    myRating = r.my_rating;
    aggregate = { avg: r.avg, count: r.count };
  } catch(e) { console.warn('[PS]', e); }
  if (user) {
    try {
      const w = await api(`/social/watchlist/check/${tmdbId}?type=${type}`);
      onWatchlist = w.on_watchlist;
    } catch(e) { console.warn('[PS]', e); }
  }
  extras.innerHTML = `
    <div class="player-actions-row">
      <div class="player-rate">
        <span class="player-action-label">Your rating:</span>
        ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button class="rate-btn ${myRating?.rating === n ? 'active' : ''}" data-rate="${n}">${n}</button>`).join('')}
        ${myRating ? `<span class="your-rating">★ ${myRating.rating}/10</span>` : ''}
      </div>
      ${user ? `<button class="player-action-btn ${onWatchlist ? 'active' : ''}" id="watchlist-toggle-btn">${onWatchlist ? '✓ On Watchlist' : '+ Watchlist'}</button>` : ''}
      <button class="player-action-btn" onclick="window.shareTitle(window._currentTmdbId, window._currentItem?.title, window._currentMediaType)">🔗 Share</button>
      <button class="player-action-btn" onclick="window.showTrailer(window._currentItem?.title, window._currentTmdbId, window._currentMediaType)">🎬 Trailer</button>
    </div>
    ${aggregate?.count ? `<div class="player-aggregate">★ ${aggregate.avg}/10 from ${aggregate.count} rating${aggregate.count === 1 ? '' : 's'}</div>` : ''}
  `;
  extras.querySelectorAll('.rate-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!user) { window.showToast('Sign in to rate', 'info'); return; }
      const r = parseInt(btn.dataset.rate);
      try {
        await api(`/social/ratings/${tmdbId}`, { method: 'POST', body: JSON.stringify({ rating: r, media_type: type }) });
        window.showToast(`Rated ${r}/10 🦚`, 'success');
        loadPlayerExtras(tmdbId, type);
      } catch (e) { window.showToast(e.message, 'error'); }
    };
  });
  const wlBtn = extras.querySelector('#watchlist-toggle-btn');
  if (wlBtn) {
    wlBtn.onclick = async () => {
      try {
        const res = await api(`/social/watchlist/${tmdbId}`, { method: 'POST', body: JSON.stringify({ title: window._currentItem?.title, poster_url: window._currentItem?.poster_url, media_type: type, release_year: window._currentItem?.release_year }) });
        window.showToast(res.action === 'added' ? 'Added to watchlist' : 'Removed from watchlist', 'success');
        loadPlayerExtras(tmdbId, type);
      } catch (e) { window.showToast(e.message, 'error'); }
    };
  }
}

export async function loadComments(tmdbId, type) {
  const list = document.getElementById('comments-list');
  if (!list) return;
  try {
    const data = await api(`/social/comments/${tmdbId}?type=${type}`);
    if (!data.comments?.length) {
      list.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px">No comments yet. Be the first.</p>';
      return;
    }
    list.innerHTML = data.comments.map(c => renderComment(c)).join('');
  } catch(e) { console.warn('[PS]', e); }
}

export async function likeComment(id, btn) {
  if (!user) { window.showToast('Sign in to like', 'info'); return; }
  try {
    const res = await api(`/social/comments/${id}/like`, { method: 'POST' });
    btn.textContent = `${res.liked ? '❤️' : '🤍'} ${parseInt(btn.textContent.split(' ')[1] || 0) + (res.liked ? 1 : -1)}`;
  } catch (e) { window.showToast(e.message, 'error'); }
}

export function replyComment(id, username) {
  const input = document.getElementById('comment-input');
  if (input) {
    input.value = `@${username} `;
    input.focus();
    input.dataset.parentId = id;
  }
}

export async function postComment() {
  if (!user) { window.showToast('Sign in to comment', 'info'); return; }
  const input = document.getElementById('comment-input');
  if (!input || !input.value.trim()) return;
  const body = input.value.trim();
  const parentId = input.dataset.parentId || null;
  try {
    await api(`/social/comments/${window._currentTmdbId}?type=${window._currentMediaType}`, { method: 'POST', body: JSON.stringify({ body, parent_id: parentId || undefined }) });
    input.value = '';
    input.dataset.parentId = '';
    window.showToast('Comment posted 💬', 'success');
    loadComments(window._currentTmdbId, window._currentMediaType);
  } catch (e) { window.showToast(e.message, 'error'); }
}

export function showTrailer(title, tmdbId, type) {
  if (tmdbId && type) {
    window.openTrailer?.(tmdbId, type);
    return;
  }
  const q = encodeURIComponent((title || 'trailer') + ' trailer');
  window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
}

export async function shareTitle(tmdbId, title, type) {
  const url = `${window.location.origin}/?${type}=${tmdbId}`;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(url);
    window.showToast('Link copied to clipboard');
  } catch {
    window.showToast(`Share link: ${url}`);
  }
}

export async function loadFavorites() {
  if (!user) return;
  const favs = await api('/content/favorites/list');
  const grid = document.getElementById('favorites-grid');
  if (favs.length === 0) {
    grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">No favorites yet</p>';
    return;
  }
  grid.innerHTML = favs.map(f => renderCard({
    tmdb_id: f.tmdb_id, title: f.title, poster_url: f.poster_url,
    release_year: f.release_year, type: f.media_type || 'movie', vote_average: 0,
  })).join('');
}

export async function loadWatchlist() {
  if (!user) return;
  try {
    const data = await api('/social/watchlist');
    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;
    if (!data.items?.length) {
      grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">Your watchlist is empty. Add titles from the player page.</p>';
      return;
    }
    grid.innerHTML = data.items.map(f => renderCard({
      tmdb_id: f.tmdb_id, title: f.title, poster_url: f.poster_url,
      release_year: f.release_year, type: f.media_type, vote_average: 0,
    })).join('');
  } catch(e) { console.warn('[PS]', e); }
}

export async function loadForYou() {
  if (!user) return;
  const grid = document.getElementById('foryou-grid');
  const reasonRow = document.getElementById('foryou-reason-row');
  if (grid) grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">Loading...</p>';
  try {
    const data = await api('/social/recommendations');
    const items = data.items || [];
    if (reasonRow) {
      reasonRow.innerHTML = '';
      items.slice(0, 15).forEach(item => reasonRow.insertAdjacentHTML('beforeend', renderCard(item)));
    }
    if (grid) {
      grid.innerHTML = '';
      if (items.length === 0) {
        grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">Rate a few movies to get recommendations 🦚</p>';
      } else {
        items.forEach(item => {
          const reason = item.source === 'collaborative' ? 'Fans like you loved this'
            : item.source === 'content-similar' ? 'Similar to your taste' : 'Top rated pick';
          grid.insertAdjacentHTML('beforeend', `
            <div class="foryou-card-wrap">
              <span class="foryou-reason">${reason}</span>
              ${renderCard(item)}
            </div>
          `);
        });
      }
    }
  } catch {
    if (grid) grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">Failed to load recommendations</p>';
  }
}

export async function loadNotifications() {
  if (!user) return;
  try {
    const data = await api('/social/notifications');
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!data.notifications?.length) {
      list.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">No notifications yet 🔕</p>';
      return;
    }
    list.innerHTML = data.notifications.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-icon">${n.type === 'reply' ? '💬' : n.type === 'achievement' ? '⚡' : '🔔'}</div>
        <div class="notif-body">
          <div class="notif-title">${sanitize(n.title)}</div>
          <div class="notif-text">${sanitize(n.body)}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (data.unread > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = data.unread > 9 ? '9+' : data.unread;
      } else {
        badge.style.display = 'none';
      }
    }
  } catch(e) { console.warn('[PS]', e); }
}

export async function markAllNotifsRead() {
  try {
    await api('/social/notifications/read-all', { method: 'POST' });
    loadNotifications();
  } catch(e) { console.warn('[PS]', e); }
}

export async function loadContinueWatching() {
  const grid = document.getElementById('continue-grid');
  grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:40px">Loading...</p>';

  let items = [];
  if (user) {
    try {
      const data = await api('/content/continue/list');
      items = (data.items || []).map(h => ({
        tmdb_id: h.tmdb_id,
        type: h.media_type || 'movie',
        title: h.title,
        poster_url: h.poster_url,
        progress_seconds: h.progress_seconds,
        runtime_seconds: h.runtime_seconds,
        progress_pct: h.runtime_seconds > 0
          ? Math.min(100, Math.round((h.progress_seconds / h.runtime_seconds) * 100))
          : 30,
      }));
    } catch {}
  }

  if (items.length === 0) {
    const history = JSON.parse(localStorage.getItem('watchHistory') || '[]');
    for (const h of history.slice(0, 20)) {
      try {
        const item = await api(`/tmdb/${h.tmdbId}?type=${h.type}`);
        items.push({ ...item, progress_pct: 25 });
      } catch {}
    }
  }

  if (items.length === 0) {
    grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">No watch history yet — start streaming!</p>';
    return;
  }
  grid.innerHTML = items.map(item => renderContinueCard(item)).join('');
}
