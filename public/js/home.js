import { api, sanitize } from './api.js';
import { renderCard, renderContinueCard } from './templates.js';
import { getWatchHistory, saveWatchHistory } from './storage.js';
import { user } from './auth.js';

export function isEnglishTitle(item) {
  const t = item.title || item.name || '';
  return /^[A-Za-z0-9\s\-\.,!?'"()&:;\u00C0-\u017F]+$/.test(t);
}

export function filterEnglishTitles(items) {
  return (items || []).filter(item => isEnglishTitle(item));
}

export async function loadGenreContent(genreId, type, name) {
  window._currentGenreId = genreId;
  window._currentGenreType = type;
  window._genrePage = 1;
  document.getElementById('home-sections').style.display = 'none';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('page-browse').classList.remove('active');
  document.getElementById('genre-results').style.display = 'block';
  document.getElementById('page-genre').classList.add('active');
  document.getElementById('genre-heading').textContent = name;
  try {
    const data = await api(`/tmdb/discover?type=${type}&with_genres=${genreId}&page=1`);
    const grid = document.getElementById('genre-grid');
    grid.innerHTML = '';
    const items = filterEnglishTitles(data.items || []);
    items.forEach(item => grid.insertAdjacentHTML('beforeend', renderCard(item)));
    document.getElementById('genre-more-btn').style.display = items.length > 0 ? 'block' : 'none';
  } catch(e) { console.warn('[PS]', e); }
}

export function closeGenre() {
  document.getElementById('genre-results').style.display = 'none';
  document.getElementById('page-genre').classList.remove('active');
  window.showPage('browse');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export async function loadMoreGenre() {
  window._genrePage = (window._genrePage || 1) + 1;
  try {
    const data = await api(`/tmdb/discover?type=${window._currentGenreType}&with_genres=${window._currentGenreId}&page=${window._genrePage}`);
    const grid = document.getElementById('genre-grid');
    filterEnglishTitles(data.items || []).forEach(item => grid.insertAdjacentHTML('beforeend', renderCard(item)));
    if (!data.items?.length) document.getElementById('genre-more-btn').style.display = 'none';
  } catch(e) { console.warn('[PS]', e); }
}

const STUDIOS = {
  Netflix: 213, HBO: 3268, Disney: 2, Marvel: 420, A24: 41077,
  Lionsgate: 1632, Universal: 33, Paramount: 4, Amazon: 10221, Apple: 87045,
};

export async function loadStudioContent(studio) {
  document.getElementById('home-sections').style.display = 'none';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('page-browse').classList.remove('active');
  document.getElementById('genre-results').style.display = 'block';
  document.getElementById('page-genre').classList.add('active');
  document.getElementById('genre-heading').textContent = studio === 'Anime' ? '🌸 Anime' : studio === 'Documentary' ? '🎓 Documentary' : `${studio}`;
  const grid = document.getElementById('genre-grid');
  grid.innerHTML = `<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:40px">Loading...</p>`;
  try {
    let data;
    if (studio === 'Anime') {
      data = await api('/tmdb/discover?type=tv&with_genres=16&page=1');
    } else if (studio === 'Documentary') {
      data = await api('/tmdb/discover?type=movie&with_genres=99&page=1');
    } else if (STUDIOS[studio]) {
      data = await api(`/tmdb/discover?type=movie&with_companies=${STUDIOS[studio]}&page=1`);
    } else {
      data = await api(`/tmdb/search?q=${encodeURIComponent(studio)}`);
    }
    grid.innerHTML = '';
    const items = filterEnglishTitles(data.items || []);
    if (items.length === 0) {
      grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:40px">No titles found</p>';
      return;
    }
    items.forEach(item => grid.insertAdjacentHTML('beforeend', renderCard(item)));
  } catch {
    grid.innerHTML = '<p style="color:#6b7280;grid-column:1/-1;text-align:center;padding:40px">Failed to load</p>';
  }
}

export function scrollRow(rowId, direction) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const scrollAmount = row.clientWidth * .75;
  row.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

export function renderRow(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container || !items) return;
  const filtered = items.filter(item => isEnglishTitle(item));
  container.innerHTML = filtered.slice(0, 20).map(item => renderCard(item)).join('');
  setTimeout(() => {
    const cards = container.querySelectorAll('.content-card:not(.animated)');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * .03}s`;
      card.classList.add('animated');
    });
  }, 50);
}

async function loadHeroCarousel() {
  try {
    const [trending, airingToday] = await Promise.all([
      api('/tmdb/trending').catch(() => ({ items: [] })),
      api('/tmdb/airing_today').catch(() => ({ items: [] })),
    ]);
    const heroItems = [...(trending.items || []), ...(airingToday.items || [])]
      .filter(i => i.vote_average >= 6)
      .slice(0, 5);
    window._heroCarousel = heroItems;
    window._heroCarouselIdx = 0;
    if (heroItems.length > 0) setHeroItem(heroItems[0]);
    if (heroItems.length > 1) startHeroCarousel();
  } catch(e) { console.warn('[PS] hero', e); }
}

function setHeroItem(hero) {
  const titleEl = document.getElementById('hero-title');
  titleEl.textContent = hero.title;
  titleEl.classList.add('iridescent-text');
  document.getElementById('hero-desc').textContent = (hero.description?.substring(0, 150) + '...') || '';
  const backdrop = document.getElementById('hero-backdrop');
  if (hero.backdrop_url) backdrop.style.backgroundImage = `url(${hero.backdrop_url})`;
  const heroBadge = document.getElementById('hero-badge');
  heroBadge.className = 'hero-badge';
  if (hero.vote_average >= 8.0) {
    heroBadge.textContent = '🔥 BEAST MODE';
    heroBadge.classList.add('hero-badge-beast');
  } else if (hero.vote_average >= 7.0) {
    heroBadge.textContent = '⚡ TOP RATED';
    heroBadge.classList.add('hero-badge-top');
  } else {
    heroBadge.textContent = '🔥 TRENDING';
  }
  const meta = document.getElementById('hero-meta');
  let metaHtml = '';
  if (hero.release_year) metaHtml += `<span>${hero.release_year}</span>`;
  if (hero.vote_average) metaHtml += `<span class="hero-rating">★ ${hero.vote_average.toFixed(1)}</span>`;
  if (hero.type) metaHtml += `<span>${hero.type === 'tv' ? 'TV Show' : 'Movie'}</span>`;
  if (hero.vote_average >= 8.0) metaHtml += `<span class="hero-beast">⚡ Beast</span>`;
  meta.innerHTML = metaHtml;
  document.getElementById('hero-actions').style.display = 'flex';
  document.getElementById('hero-play-btn').onclick = () => window.playContent(hero.tmdb_id, hero.type);
  document.getElementById('hero-info-btn').onclick = () => window.openDetail(hero.tmdb_id, hero.type);
}

function startHeroCarousel() {
  if (window._heroCarouselInterval) clearInterval(window._heroCarouselInterval);
  window._heroCarouselInterval = setInterval(() => {
    const items = window._heroCarousel;
    if (!items?.length) return;
    window._heroCarouselIdx = (window._heroCarouselIdx + 1) % items.length;
    const hero = items[window._heroCarouselIdx];
    const backdrop = document.getElementById('hero-backdrop');
    backdrop.style.opacity = '0';
    setTimeout(() => {
      setHeroItem(hero);
      backdrop.style.transition = 'opacity 0.6s ease';
      backdrop.style.opacity = '1';
    }, 300);
  }, 6000);
}

export async function loadHome() {
  document.getElementById('search').value = '';
  document.getElementById('search-results').style.display = 'none';
  document.getElementById('genre-results').style.display = 'none';
  document.getElementById('home-sections').style.display = 'block';

  const rows = ['trending-row','nowplaying-row','newus-row','topmovies-row','upcoming-row','ontv-row','toptv-row','zeus-row','recommended-row','recently-row'];
  rows.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = renderSkeletons(6); });

  try {
    const [trending, nowPlaying, topMovies, onTV, topTV, genres, newThisWeek, upcoming, airingToday] = await Promise.all([
      api('/tmdb/trending').catch(() => ({ items: [] })),
      api('/tmdb/now_playing').catch(() => ({ items: [] })),
      api('/tmdb/top_rated?type=movie').catch(() => ({ items: [] })),
      api('/tmdb/on_the_air').catch(() => ({ items: [] })),
      api('/tmdb/top_rated?type=tv').catch(() => ({ items: [] })),
      api('/tmdb/genres?type=movie').catch(() => []),
      api('/tmdb/new_releases?region=US&type=movie').catch(() => ({ items: [] })),
      api('/tmdb/upcoming?region=US').catch(() => ({ items: [] })),
      api('/tmdb/airing_today').catch(() => ({ items: [] })),
    ]);

    loadHeroCarousel();

    const topTenMix = [...trending.items, ...airingToday.items]
      .filter(i => i.type === 'movie')
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 10);
    document.getElementById('top-ten-grid').innerHTML = renderTopTen(topTenMix);

    renderRow('newus-row', newThisWeek.items);
    renderRow('trending-row', trending.items);

    const zeusIds = [324109,306499,291018,291017,275096,204410,234927,206329,218537,245763,273647,246811,287245,229141,288715,318258,297403,271079,230451,132881,100048,194822,218533,204369,91421,156307];
    const zeusShows = (await Promise.all(zeusIds.map(id => api(`/tmdb/${id}?type=tv`).catch(() => null)))).filter(Boolean);
    if (zeusShows.length > 0) {
      document.getElementById('zeus-section').style.display = 'block';
      renderRow('zeus-row', zeusShows);
    }

    renderRow('nowplaying-row', nowPlaying.items);
    renderRow('topmovies-row', topMovies.items);
    renderRow('ontv-row', onTV.items);
    renderRow('toptv-row', topTV.items);
    renderRow('upcoming-row', upcoming.items);

    // Recently Viewed
    const recent = JSON.parse(localStorage.getItem('watchHistory') || '[]');
    if (recent.length > 0) {
      document.getElementById('recently-section').style.display = 'block';
      const grid = document.getElementById('recently-row');
      grid.innerHTML = '';
      recent.slice(0, 15).forEach(item => {
        grid.insertAdjacentHTML('beforeend', renderCard({
          tmdb_id: item.tmdbId, title: item.title || 'Watched', type: item.type,
          poster_url: null, vote_average: 0, release_year: null,
        }));
      });
    }

    if (user) {
      try {
        const cont = await api('/content/continue/list');
        if (cont.items?.length > 0) {
          document.getElementById('continue-section').style.display = 'block';
          const row = document.getElementById('continue-row');
          row.innerHTML = cont.items.map(h => renderContinueCard({
            tmdb_id: h.tmdb_id, type: h.media_type || 'movie', title: h.title,
            poster_url: h.poster_url, progress_seconds: h.progress_seconds,
            runtime_seconds: h.runtime_seconds, vote_average: 0, release_year: null,
          })).join('');
        }
      } catch(e) { console.warn('[PS]', e); }

      try {
        const favs = await api('/content/favorites/list');
        if (favs.length > 0) {
          document.getElementById('recommended-section').style.display = 'block';
          renderRow('recommended-row', trending.items.concat(nowPlaying.items).slice(0, 20));
        }
      } catch(e) { console.warn('[PS]', e); }

      try {
        const rec = await api('/social/recommendations');
        if (rec.items?.length > 0) {
          document.getElementById('recommended-section').style.display = 'block';
          renderRow('recommended-row', rec.items.slice(0, 20));
        }
      } catch(e) { console.warn('[PS]', e); }
    }

    // Genre tabs
    const tabs = document.getElementById('genre-tabs');
    tabs.innerHTML = (genres || []).slice(0, 12).map(g =>
      `<button class="genre-tab" onclick="window.loadGenreContent(${g.id}, 'movie', '${sanitize(g.name)}')">${sanitize(g.name)}</button>`
    ).join('');

    setTimeout(() => window.reinitScrollAnimations?.(), 100);
  } catch (e) {
    console.error('Home load error:', e);
    window.showToast?.('Failed to load content. Check your connection.', 'error');
  }
}

function renderTopTen(items) {
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

function renderSkeletons(count) {
  return Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
}
