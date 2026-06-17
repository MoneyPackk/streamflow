import { api, sanitize } from './api.js';
import { renderCard } from './templates.js';
import { filterEnglishTitles } from './home.js';
import { saveSearchHistory, getSearchHistory } from './storage.js';

let searchPage = 1;
let searchTimer = null;

export function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(performSearch, 150);
}

export function performSearch() {
  const q = document.getElementById('search').value.trim();
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
  autocomplete.innerHTML = history.slice(0, 5).map(q =>
    `<button class="search-chip" onclick="document.getElementById('search').value='${sanitize(q)}';performSearch();">${sanitize(q)}</button>`
  ).join('');
}
