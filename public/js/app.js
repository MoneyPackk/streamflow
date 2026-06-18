import { API, sanitize, api, timeAgo } from './api.js';
import { loadSession, isAuthenticated, toggleAuth, handleAuth, logout, updateNav, updateCreditsBadge, user } from './auth.js';
import { loadHome, filterEnglishTitles, loadGenreContent, closeGenre, loadMoreGenre, loadStudioContent, scrollRow, renderRow } from './home.js';
import { debounceSearch, performSearch, loadMoreSearch, openSearchFilters, closeSearchFilters, applyFilters, initSearch } from './search.js';
import { openDetail, closeDetail, playFromDetail, openTrailer, closeTrailer, initDetailModal } from './detail.js';
import { playContent, stopPlayer, playTVEpisode, prevEpisode, nextEpisode, playNextEpisode, cancelCountdown, toggleFullscreen, togglePip, toggleTheater, setVolume, toggleMute, getPlayerState } from './player.js';
import { toggleFavorite, loadPlayerExtras, loadComments, likeComment, replyComment, postComment, showTrailer, shareTitle, loadFavorites, loadWatchlist, loadForYou, loadNotifications, markAllNotifsRead, loadContinueWatching } from './social.js';
import { loadProfile, saveProfile } from './profile.js';
import { showToast, showPage, showSection, cycleTheme, toggleShortcuts, initScrollAnimations, reinitScrollAnimations, initKeyboardShortcuts, updateContinueNav, handleUrlParams, showWelcome, dismissWelcome, updateContinueBar, hideContinueBar, initMouseGlow, initParallaxScroll } from './ui.js';
import { initPartyUI, updatePartyPanelVisibility } from './parties.js';
import { getWatchHistory, saveWatchHistory, getTheme, setTheme } from './storage.js';
import { renderCard, renderTopTen, renderSkeletons } from './templates.js';

// Expose to window for inline event handlers and backward compatibility
function exposeAll() {
  window.showPage = showPage;
  window.playContent = playContent;
  window.showToast = showToast;
  window.filterByType = showSection;
  window.showSection = showSection;
  window.toggleAuth = toggleAuth;
  window.handleAuth = () => handleAuth(showToast, showPage);
  window.logout = () => logout(showToast, showPage);
  window.toggleFavorite = toggleFavorite;
  window.performSearch = performSearch;
  window.scrollRow = scrollRow;
  window.loadMoreSearch = loadMoreSearch;
  window.closeGenre = closeGenre;
  window.loadMoreGenre = loadMoreGenre;
  window.loadGenreContent = loadGenreContent;
  window.loadStudioContent = loadStudioContent;
  window.saveProfile = saveProfile;
  window.showTrailer = showTrailer;
  window.shareTitle = shareTitle;
  window.toggleShortcuts = toggleShortcuts;
  window.cycleTheme = cycleTheme;
  window.openSearchFilters = openSearchFilters;
  window.closeSearchFilters = closeSearchFilters;
  window.applyFilters = applyFilters;
  window.markAllNotifsRead = markAllNotifsRead;
  window.loadHome = loadHome;
  window.loadFavorites = loadFavorites;
  window.loadContinueWatching = loadContinueWatching;
  window.loadProfile = loadProfile;
  window.loadForYou = loadForYou;
  window.loadWatchlist = loadWatchlist;
  window.loadNotifications = loadNotifications;
  window.loadPlayerExtras = loadPlayerExtras;
  window.loadComments = loadComments;
  window.likeComment = likeComment;
  window.replyComment = replyComment;
  window.postComment = postComment;
  window.toggleFullscreen = toggleFullscreen;
  window.togglePip = togglePip;
  window.toggleTheater = toggleTheater;
  window.setVolume = setVolume;
  window.toggleMute = toggleMute;
  window.prevEpisode = prevEpisode;
  window.nextEpisode = nextEpisode;
  window.playNextEpisode = playNextEpisode;
  window.cancelCountdown = cancelCountdown;
  window.playTVEpisode = playTVEpisode;
  window.updateContinueNav = updateContinueNav;
  window.reinitScrollAnimations = reinitScrollAnimations;
  window.getPlayerState = getPlayerState;
  window.hideContinueBar = hideContinueBar;
  window.openDetail = openDetail;
  window.closeDetail = closeDetail;
  window.playFromDetail = playFromDetail;
  window.openTrailer = openTrailer;
  window.closeTrailer = closeTrailer;
  window.updatePartyPanelVisibility = updatePartyPanelVisibility;
  window.debounceSearch = debounceSearch;
}

async function init() {
  exposeAll();

  // Set initial theme
  setTheme(getTheme());

  // Show welcome animation
  showWelcome();

  // Load session
  await loadSession();
  updateNav(showToast);
  updatePartyPanelVisibility();

  // Load home page
  await loadHome();

  initPartyUI();
  initDetailModal();
  initSearch();

  // Init keyboard shortcuts
  initKeyboardShortcuts();

  // Init scroll animations
  initScrollAnimations();

  // Init mouse glow effect
  initMouseGlow();

  // Init parallax scroll effect
  initParallaxScroll();

  // Update continue nav
  updateContinueNav();
  updateContinueBar();

  // Handle URL params for direct linking
  handleUrlParams();

  // Back to top button
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    if (window.scrollY > 600) btn.classList.add('visible');
    else btn.classList.remove('visible');
  }, { passive: true });

  // Hero parallax
  window.addEventListener('scroll', () => {
    const backdrop = document.getElementById('hero-backdrop');
    if (backdrop) backdrop.style.transform = `translateY(${window.scrollY * 0.3}px)`;
  }, { passive: true });

  // Audio message listener from embed
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'volumeState') {
      if (e.data.volume != null) window._volume = e.data.volume;
      if (e.data.muted != null) window._muted = e.data.muted;
    }
  });

  // Button ripple
  document.addEventListener('mousemove', (e) => {
    const btn = e.target.closest('.hero-play-btn, .play-btn, .server-btn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--x', ((e.clientX - rect.left) / rect.width * 100) + '%');
      btn.style.setProperty('--y', ((e.clientY - rect.top) / rect.height * 100) + '%');
    }
  });

  // Bind genre back button
  document.getElementById('genre-back-btn')?.addEventListener('click', closeGenre);

  // Bind player back button
  const playerBackBtn = document.querySelector('#page-player .back-btn');
  if (playerBackBtn) playerBackBtn.addEventListener('click', () => showPage('browse'));

  // Store tabs click handler
  document.querySelectorAll('.store-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Unregister any old service workers (SW was caching stale JS)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    });
  }

  dismissWelcome();
}

init().catch((err) => {
  console.error('App init failed:', err);
  dismissWelcome();
  document.getElementById('toast-container')?.insertAdjacentHTML(
    'beforeend',
    '<div class="toast error"><span class="toast-icon">✕</span><span>Failed to load app — try a hard refresh (Ctrl+Shift+R)</span></div>'
  );
});
