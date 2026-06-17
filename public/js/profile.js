import { api, sanitize } from './api.js';
import { user, updateCreditsBadge } from './auth.js';
import { renderAchievement } from './templates.js';
import { setTheme } from './storage.js';

let ALL_ACHIEVEMENTS = {};
let STORE_DATA = null;
let activeStoreTab = 'themes';

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
    const storeBal = document.getElementById('store-balance');
    if (storeBal) storeBal.textContent = me.peacock_credits || 0;

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

async function loadStore() {
  const grid = document.getElementById('store-grid');
  if (!grid) return;
  try {
    STORE_DATA = await api('/settings/store');
    renderStoreTab(activeStoreTab);
    document.querySelectorAll('.store-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeStoreTab = tab.dataset.tab;
        renderStoreTab(activeStoreTab);
      };
    });
  } catch {
    grid.innerHTML = '<p style="color:#6b7280">Store unavailable</p>';
  }
}

function renderStoreTab(tab) {
  const grid = document.getElementById('store-grid');
  if (!grid || !STORE_DATA) return;
  const key = tab === 'pfp_skins' ? 'pfp_skins' : tab === 'perks' ? 'perks' : 'themes';
  const items = STORE_DATA[key] || [];
  const type = tab === 'pfp_skins' ? 'pfp_skin' : tab === 'perks' ? 'perk' : 'theme';
  grid.innerHTML = items.map(item => `
    <div class="store-item">
      <div class="store-item-name">${sanitize(item.name)}</div>
      <div class="store-item-desc">${sanitize(item.description)}</div>
      <div class="store-item-cost">${item.cost === 0 ? 'Free' : `${item.cost} 🦚`}</div>
      <button class="store-buy-btn" data-type="${type}" data-id="${item.id}" data-cost="${item.cost}">
        ${item.cost === 0 ? 'Equip' : 'Buy'}
      </button>
    </div>
  `).join('');
  grid.querySelectorAll('.store-buy-btn').forEach(btn => {
    btn.onclick = () => purchaseStoreItem(btn.dataset.type, btn.dataset.id, parseInt(btn.dataset.cost, 10));
  });
}

async function purchaseStoreItem(type, id, cost) {
  try {
    const res = await api('/settings/spend', { method: 'POST', body: JSON.stringify({ type, id }) });
    document.getElementById('store-balance').textContent = res.new_credits;
    document.getElementById('profile-credits').textContent = res.new_credits;
    updateCreditsBadge(res.new_credits);
    if (type === 'theme') {
      document.documentElement.setAttribute('data-theme', id);
      setTheme(id);
    }
    window.showToast(cost === 0 ? 'Equipped!' : `Purchased for ${cost} 🦚`, 'success');
  } catch (e) {
    window.showToast(e.message || 'Purchase failed', 'error');
  }
}

export async function saveProfile() {
  const bio = document.getElementById('profile-bio-input').value.trim();
  const favorite_genre = document.getElementById('profile-genre-input').value;
  try {
    await api('/auth/me', { method: 'PUT', body: JSON.stringify({ bio, favorite_genre }) });
    window.showToast('Profile saved! 🦚', 'success');
    document.getElementById('profile-bio').textContent = bio || 'No bio yet';
  } catch (e) {
    window.showToast(e.message || 'Save failed', 'error');
  }
}
