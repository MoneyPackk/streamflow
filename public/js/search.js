import { api, sanitize } from './api.js';
import { renderCard } from './templates.js';
import { filterEnglishTitles } from './home.js';
import { saveSearchHistory, getSearchHistory } from './storage.js';

let searchPage = 1;
let searchTimer = null;
let suggestTimer = null;

export function debounceSearch() {
  const q = document.getElementById('search').value.trim();
  clearTimeout(searchTimer);
  clearTimeout(suggestTimer);
  if (q.length >= 2) {
    suggestTimer = setTimeout(() => loadSuggestions(q), 120);
  } else if (!q) {
    hideSuggestions();
    showSearchHistory();
  }
  searchTimer = setTimeout(performSearch, 400);
}

async function loadSuggestions(q) {
  const autocomplete = document.getElementById('search-autocomplete');
  if (!autocomplete) return;
  try {
    const data = await api(`/search/suggest?q=${encodeURIComponent(q)}`);
    const suggestions = data.suggestions || [];
    if (!suggestions.length) {
      autocomplete.style.display = 'none';
      return;
    }
    autocomplete.style.display = 'block';
    autocomplete.innerHTML = suggestions.map(s => `
      <button type="button" class="search-suggest-item" data-id="${s.tmdb_id}" data-type="${s.type}">
        ${s.poster ? `<img src="${sanitize(s.poster)}" alt="">` : ''}
        <span>${sanitize(s.title)} <small style="opacity:.6">${s.year || ''} · ${s.type}</small></span>
      </button>
    `).join('');
    autocomplete.querySelectorAll('.search-suggest-item').forEach(btn => {
      btn.onclick = () => {
        hideSuggestions();
        document.getElementById('search').value = '';
        window.openDetail?.(parseInt(btn.dataset.id), btn.dataset.type);
      };
    });
  } catch {
    autocomplete.style.display = 'none';
  }
}

function hideSuggestions() {
  const el = document.getElementById('search-autocomplete');
  if (el) el.style.display = 'none';
}

export function performSearch() {
  const q = document.getElementById('search').value.trim();
  hideSuggestions();
  if (!q) {
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('home-sections').style.display = 'block';
    document.getElementById('genre-results').style.display = 'none';
    showSearchHistory();
    return;
  }
  searchPage = 1;
  saveSearchHistory(q);
  document.getElementById('home-sections').style.display = 'none';
  document.getElementById('genre-results').style.display = 'none';
  document.getElementById('search-results').style.display = 'block';
  document.getElementById('search-heading').textContent = `Results for "${q}"`;
  loadSearchResults(q, true);
}

async function loadSearchResults(q, reset) {
  try {
    const data = await api(`/tmdb/search?q=${encodeURIComponent(q)}&page=${searchPage}`);
    const grid = document.getElementById('search-grid');
    if (reset) grid.innerHTML = '';
    const items = filterEnglishTitles(data.items || []);
    if (items.length === 0 && reset) {
      grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:40px">Nothing found. Try a different search.</p>';
    }
    items.forEach(item => grid.insertAdjacentHTML('beforeend', renderCard(item)));
    document.getElementById('search-more-btn').style.display = items.length > 0 ? 'block' : 'none';
  } catch(e) { console.warn('[PS]', e); }
}

export function loadMoreSearch() {
  searchPage++;
  loadSearchResults(document.getElementById('search').value.trim(), false);
}

export function openSearchFilters() {
  const m = document.getElementById('filters-modal');
  if (m) m.style.display = 'flex';
}

export function closeSearchFilters() {
  const m = document.getElementById('filters-modal');
  if (m) m.style.display = 'none';
}

export function applyFilters() {
  closeSearchFilters();
  performSearch();
}

function showSearchHistory() {
  const history = getSearchHistory();
  const autocomplete = document.getElementById('search-autocomplete');
  if (!autocomplete || !history.length) {
    if (autocomplete) autocomplete.style.display = 'none';
    return;
  }
  autocomplete.style.display = 'block';
  autocomplete.innerHTML = `<div style="font-size:.65rem;color:var(--text-subtle);padding:4px 8px;text-transform:uppercase">Recent</div>` +
    history.slice(0, 5).map(q =>
      `<button type="button" class="search-chip" data-q="${sanitize(q)}">${sanitize(q)}</button>`
    ).join('');
  autocomplete.querySelectorAll('.search-chip').forEach(chip => {
    chip.onclick = () => {
      document.getElementById('search').value = chip.dataset.q;
      performSearch();
    };
  });
}

export function initSearch() {
  const input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('focus', () => {
    if (!input.value.trim()) showSearchHistory();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) hideSuggestions();
  });
}
