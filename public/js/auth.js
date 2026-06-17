import { api, sanitize } from './api.js';

export let user = null;

export async function loadSession() {
  try {
    user = await api('/auth/me');
    return user;
  } catch {
    user = null;
    return null;
  }
}

export function isAuthenticated() { return !!user; }

export async function toggleAuth() {
  const title = document.getElementById('auth-title');
  const isLogin = title.textContent === 'Sign In';
  title.textContent = isLogin ? 'Register' : 'Sign In';
  document.getElementById('auth-btn').textContent = isLogin ? 'Register' : 'Sign In';
  document.getElementById('auth-username').style.display = isLogin ? 'block' : 'none';
  document.getElementById('auth-error').textContent = '';
}

export async function handleAuth(showToastFn, showPageFn) {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username').value;
  const isRegister = document.getElementById('auth-title').textContent === 'Register';
  try {
    const data = isRegister
      ? await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) })
      : await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    user = data.user;
    updateNav(showToastFn);
    showToastFn(isRegister ? `Welcome to the flock, ${user.username}! 🦚` : `Welcome back, ${user.username}!`, 'success');
    showPageFn('browse');
    return true;
  } catch (e) {
    document.getElementById('auth-error').textContent = e.message;
    showToastFn(e.message, 'error');
    return false;
  }
}

export async function logout(showToastFn, showPageFn) {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  user = null;
  updateNav(showToastFn);
  showToastFn('Signed out', 'info');
  showPageFn('browse');
}

export function updateNav(showToastFn) {
  if (user) {
    document.getElementById('nav-login').style.display = 'none';
    document.getElementById('nav-logout').style.display = 'inline';
    document.getElementById('nav-favorites').style.display = 'inline';
    const navForyou = document.getElementById('nav-foryou');
    if (navForyou) navForyou.style.display = 'inline';
    const navWatchlist = document.getElementById('nav-watchlist');
    if (navWatchlist) navWatchlist.style.display = 'inline';
    const navNotifs = document.getElementById('nav-notifications');
    if (navNotifs) navNotifs.style.display = 'inline';
    const navProfile = document.getElementById('nav-profile');
    if (navProfile) navProfile.style.display = 'inline';
    const navUsername = document.getElementById('nav-username');
    if (navUsername) navUsername.textContent = user.username;
    updateCreditsBadge(user.peacock_credits || 0);
  } else {
    document.getElementById('nav-login').style.display = 'inline';
    document.getElementById('nav-logout').style.display = 'none';
    document.getElementById('nav-favorites').style.display = 'none';
    ['nav-foryou', 'nav-watchlist', 'nav-notifications', 'nav-profile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

export function updateCreditsBadge(credits) {
  let badge = document.getElementById('nav-credits-badge');
  if (credits > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'nav-credits-badge';
      badge.className = 'nav-credits-badge';
      const nav = document.querySelector('.nav-links');
      if (nav) nav.insertBefore(badge, nav.firstChild);
    }
    badge.textContent = `🦚 ${credits}`;
    badge.title = `${credits} Peacock Credits`;
  } else if (badge) {
    badge.remove();
  }
}
