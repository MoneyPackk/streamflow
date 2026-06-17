import { sanitize } from './api.js';
import { user } from './auth.js';
import { getTheme, setTheme, getWatchHistory } from './storage.js';
import { stopPlayer } from './player.js';

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${sanitize(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showPage(name) {
  const authRequired = ['favorites', 'continue', 'profile', 'foryou', 'watchlist', 'notifications'];
  if (authRequired.includes(name) && !user) {
    showToast('Sign in to access this page', 'info');
    name = 'login';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${name}`);
  if (pageEl) pageEl.classList.add('active');
  if (document.getElementById('page-player')?.classList.contains('active')) {
    stopPlayer();
  }
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('genre-results').style.display = 'none';
  document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
  const tabMap = { browse: 'home', login: 'profile', profile: 'profile', watchlist: 'library', favorites: 'library', continue: 'library', foryou: 'home', notifications: 'profile' };
  const tab = document.querySelector(`.mobile-tab[data-page="${tabMap[name] || 'home'}"]`);
  if (tab) tab.classList.add('active');
  if (name === 'browse') window.loadHome?.();
  if (name === 'favorites') window.loadFavorites?.();
  if (name === 'continue') window.loadContinueWatching?.();
  if (name === 'profile') window.loadProfile?.();
  if (name === 'foryou') window.loadForYou?.();
  if (name === 'watchlist') window.loadWatchlist?.();
  if (name === 'notifications') window.loadNotifications?.();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function showSection(type) {
  showPage('browse');
  setTimeout(() => {
    const rowId = type === 'tv' ? 'ontv-row' : 'nowplaying-row';
    const row = document.getElementById(rowId);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 500);
}

export function cycleTheme() {
  const html = document.documentElement;
  const order = ['dark', 'light', 'midnight', 'sunset', 'forest'];
  const current = html.getAttribute('data-theme') || 'dark';
  const next = order[(order.indexOf(current) + 1) % order.length];
  html.setAttribute('data-theme', next);
  setTheme(next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '🌙' : next === 'light' ? '☀️' : '🎨';
  showToast(`Theme: ${next}`, 'info', 1500);
}

export function toggleShortcuts(show) {
  const modal = document.getElementById('shortcuts-modal');
  if (!modal) return;
  modal.style.display = show === false || (show === undefined && modal.style.display !== 'none') ? 'none' : 'flex';
}

export function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        const cards = entry.target.querySelectorAll('.content-card:not(.animated)');
        cards.forEach((card, i) => {
          card.style.animationDelay = `${i * .04}s`;
          card.classList.add('animated');
        });
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.content-section').forEach(section => observer.observe(section));
}

export function reinitScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        const cards = entry.target.querySelectorAll('.content-card:not(.animated)');
        cards.forEach((card, i) => {
          card.style.animationDelay = `${i * .04}s`;
          card.classList.add('animated');
        });
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.content-section:not(.visible)').forEach(s => observer.observe(s));
}

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch(e.key) {
      case '/':
        e.preventDefault();
        document.getElementById('search')?.focus();
        break;
      case 'Escape':
        if (document.getElementById('page-player').classList.contains('active')) {
          showPage('browse');
        } else {
          document.getElementById('search')?.blur();
          if (document.getElementById('search').value) {
            document.getElementById('search').value = '';
            window.performSearch?.();
          }
        }
        break;
      case '?':
        e.preventDefault();
        toggleShortcuts(true);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!e.ctrlKey) {
          const vol = document.getElementById('chrome-volume');
          if (vol) { vol.value = Math.min(1, parseFloat(vol.value) + 0.1); window.setVolume?.(vol.value); }
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!e.ctrlKey) {
          const vol = document.getElementById('chrome-volume');
          if (vol) { vol.value = Math.max(0, parseFloat(vol.value) - 0.1); window.setVolume?.(vol.value); }
        }
        break;
    }
  });
}

export function updateContinueNav() {
  const nav = document.getElementById('nav-continue');
  const history = getWatchHistory();
  if (nav) nav.style.display = history.length > 0 ? 'inline' : 'none';
  updateContinueBar();
}

export function updateContinueBar() {
  const bar = document.getElementById('continue-bar');
  if (!bar) return;
  if (sessionStorage.getItem('ps_hide_continue_bar') === '1') {
    bar.style.display = 'none';
    return;
  }
  const history = getWatchHistory();
  if (!history.length) {
    bar.style.display = 'none';
    return;
  }
  const latest = history[0];
  bar.style.display = 'block';
  const thumb = document.getElementById('continue-bar-thumb');
  if (thumb) {
    thumb.style.backgroundImage = latest.poster_url ? `url(${latest.poster_url})` : 'none';
  }
  const title = document.getElementById('continue-bar-title');
  if (title) title.textContent = latest.title || 'Continue watching';
  const meta = document.getElementById('continue-bar-meta');
  if (meta) {
    meta.textContent = latest.type === 'tv' && latest.season
      ? `S${latest.season} E${latest.episode || 1}`
      : (latest.type === 'tv' ? 'TV Show' : 'Movie');
  }
  const btn = document.getElementById('continue-bar-btn');
  if (btn) {
    btn.onclick = () => window.playContent?.(latest.tmdbId, latest.type);
  }
  const fill = document.getElementById('continue-bar-progress-fill');
  const pct = latest.progress_pct || (latest.progress_seconds && latest.runtime_seconds
    ? Math.min(100, Math.round((latest.progress_seconds / latest.runtime_seconds) * 100)) : 25);
  if (fill) fill.style.width = `${pct}%`;
}

export function hideContinueBar() {
  const bar = document.getElementById('continue-bar');
  if (bar) bar.style.display = 'none';
  sessionStorage.setItem('ps_hide_continue_bar', '1');
}

export function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get('movie');
  const tvId = params.get('tv');
  const watchPath = window.location.pathname.match(/^\/watch\/(movie|tv)\/(\d+)/);
  if (watchPath) {
    const [, type, id] = watchPath;
    setTimeout(() => window.openDetail?.(parseInt(id), type), 100);
  } else if (movieId) {
    setTimeout(() => window.openDetail?.(parseInt(movieId), 'movie'), 100);
  } else if (tvId) {
    setTimeout(() => window.openDetail?.(parseInt(tvId), 'tv'), 100);
  }
}

export function showWelcome() {
  const WELCOME_KEY = 'ps_welcomed_v1';
  if (!localStorage.getItem(WELCOME_KEY)) {
    setTimeout(() => {
      const overlay = document.getElementById('welcome-overlay');
      setTimeout(() => {
        overlay.classList.add('hide');
        setTimeout(() => {
          overlay.style.display = 'none';
          localStorage.setItem(WELCOME_KEY, '1');
        }, 800);
      }, 2200);
    }, 400);
  } else {
    document.getElementById('welcome-overlay').style.display = 'none';
  }
}
