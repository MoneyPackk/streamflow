import { api, sanitize, timeAgo } from './api.js';
import { user, updateCreditsBadge } from './auth.js';
import { renderAchievement } from './templates.js';

let ALL_ACHIEVEMENTS = {};

export async function loadProfile() {
  if (!user) { window.showPage('login'); return; }
  try {
    const [me, achData, allAchData] = await Promise.all([
      api('/auth/me'),
      api('/auth/achievements').catch(() => ({ achievements: [] })),
      api('/content/achievements/list').catch(() => ({})),
    ]);
    ALL_ACHIEVEMENTS = allAchData || {};
    document.getElementById('profile-username').textContent = me.username;
    document.getElementById('profile-bio').textContent = me.bio || 'No bio yet';
    document.getElementById('profile-credits').textContent = me.peacock_credits || 0;
    document.getElementById('profile-streak').textContent = me.streak_days || 0;
    document.getElementById('profile-watched').textContent = me.watch_count || 0;
    document.getElementById('profile-favs-count').textContent = me.fav_count || 0;
    document.getElementById('profile-achievements').textContent = achData.achievements?.length || 0;
    document.getElementById('profile-bio-input').value = me.bio || '';
    document.getElementById('profile-genre-input').value = me.favorite_genre || '';
    updateCreditsBadge(me.peacock_credits || 0);

    const unlocked = new Set((achData.achievements || []).map(a => a.achievement_key));
    const grid = document.getElementById('achievements-grid');
    if (grid) {
      const entries = Object.entries(ALL_ACHIEVEMENTS);
      if (entries.length === 0) {
        grid.innerHTML = '<p style="color:#6b7280">Loading achievements...</p>';
      } else {
        grid.innerHTML = entries.map(([key, ach]) => renderAchievement(key, ach, unlocked.has(key))).join('');
      }
    }
  } catch (e) {
    window.showToast('Failed to load profile', 'error');
  }
  loadStats();
  loadStore();
}

async function loadStats() {
  if (!user) return;
  try {
    const s = await api('/settings/stats');
    const el = id => document.getElementById(id);
    if (el('profile-hours')) el('profile-hours').textContent = `${Math.floor(s.total_minutes / 60)}h`;
    if (el('profile-this-week')) el('profile-this-week').textContent = `${Math.floor(s.this_week_minutes / 60)}h`;
    if (el('profile-ratings-given')) el('profile-ratings-given').textContent = s.ratings_given;
    if (el('profile-comments')) el('profile-comments').textContent = s.comments;
    const feed = el('activity-feed');
    if (feed && s.milestones?.length) {
      feed.innerHTML = s.milestones.map(m => `
        <div class="milestone-item">
          <div class="milestone-icon">${m.type === 'achievement' ? '⚡' : '🎬'}</div>
          <div class="milestone-text">
            <div>${m.type === 'achievement' ? 'Achievement unlocked' : 'Watched'}: <strong>${sanitize(m.title || '')}</strong></div>
            <div class="milestone-time">${timeAgo(m.at)}</div>
          </div>
        </div>
      `).join('');
    } else if (feed) {
      feed.innerHTML = '<p style="color:#6b7280">Start watching to see your activity here 🎬</p>';
    }
  } catch(e) { console.warn('[PS]', e); }
}

async function loadStore() {
  const grid = document.getElementById('store-grid');
  if (!grid) return;
  // Minimal store — show coming soon
  grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:60px">🦚 More items coming to the Peacock Store soon</p>';
}

export async function saveProfile() {
  const bio = document.getElementById('profile-bio-input').value.trim();
  const favorite_genre = document.getElementById('profile-genre-input').value;
  try {
    const data = await api('/auth/me', { method: 'PUT', body: JSON.stringify({ bio, favorite_genre }) });
    window.showToast('Profile saved! 🦚', 'success');
    document.getElementById('profile-bio').textContent = bio || 'No bio yet';
  } catch (e) {
    window.showToast(e.message || 'Save failed', 'error');
  }
}
