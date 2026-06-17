export const WELCOME_KEY = 'ps_welcomed_v1';

export function getWatchHistory() {
  try {
    return JSON.parse(localStorage.getItem('watchHistory') || '[]');
  } catch { return []; }
}

export function saveWatchHistory(history) {
  try {
    localStorage.setItem('watchHistory', JSON.stringify(history.slice(0, 20)));
  } catch {}
}

export function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
  } catch { return []; }
}

export function saveRecentlyViewed(item) {
  try {
    const recent = getRecentlyViewed();
    const filtered = recent.filter(r => r.tmdb_id !== item.tmdb_id);
    filtered.unshift(item);
    localStorage.setItem('recentlyViewed', JSON.stringify(filtered.slice(0, 30)));
  } catch {}
}

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem('searchHistory') || '[]');
  } catch { return []; }
}

export function saveSearchHistory(query) {
  try {
    const history = getSearchHistory();
    const filtered = history.filter(q => q !== query);
    filtered.unshift(query);
    localStorage.setItem('searchHistory', JSON.stringify(filtered.slice(0, 10)));
  } catch {}
}

export function getTheme() {
  try { return localStorage.getItem('ps_theme') || 'dark'; }
  catch { return 'dark'; }
}

export function setTheme(theme) {
  try { localStorage.setItem('ps_theme', theme); } catch {}
  document.documentElement.setAttribute('data-theme', theme);
}
