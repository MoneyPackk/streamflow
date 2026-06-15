let token = localStorage.getItem('token');
let user = null;
let player = null;
let searchTimer = null;
const API = '/api';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.nojson) delete headers['Content-Type'];
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (opts.nojson) return res;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (name === 'browse') loadContent();
  if (name === 'favorites') loadFavorites();
  if (player) { player.dispose(); player = null; }
}

function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(loadContent, 300); }

function toggleAuth() {
  const isRegister = document.getElementById('auth-title').textContent === 'Sign In';
  document.getElementById('auth-title').textContent = isRegister ? 'Register' : 'Sign In';
  document.getElementById('auth-btn').textContent = isRegister ? 'Register' : 'Sign In';
  document.getElementById('auth-username').style.display = isRegister ? 'block' : 'none';
  document.getElementById('auth-toggle').textContent = isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register";
  document.getElementById('auth-error').textContent = '';
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username').value;
  const isRegister = document.getElementById('auth-title').textContent === 'Register';
  try {
    const data = isRegister
      ? await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) })
      : await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    updateNav();
    showPage('browse');
  } catch (e) {
    document.getElementById('auth-error').textContent = e.message;
  }
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem('token');
  updateNav();
  showPage('browse');
}

async function updateNav() {
  if (token) {
    try {
      user = await api('/auth/me');
      document.getElementById('nav-login').style.display = 'none';
      document.getElementById('nav-logout').style.display = 'inline';
      document.getElementById('nav-favorites').style.display = 'inline';
      document.getElementById('nav-admin').style.display = user.is_admin ? 'inline' : 'none';
    } catch { token = null; localStorage.removeItem('token'); }
  } else {
    document.getElementById('nav-login').style.display = 'inline';
    document.getElementById('nav-logout').style.display = 'none';
    document.getElementById('nav-favorites').style.display = 'none';
    document.getElementById('nav-admin').style.display = 'none';
  }
}

async function loadContent() {
  const search = document.getElementById('search').value;
  const genre = document.getElementById('genre-filter').value;
  const type = document.getElementById('type-filter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (genre) params.set('genre', genre);
  if (type) params.set('type', type);

  try {
    const data = await api(`/content?${params}`);
    const grid = document.getElementById('content-grid');
    grid.innerHTML = data.items.map(c => renderCard(c)).join('');

    const genreSelect = document.getElementById('genre-filter');
    if (genreSelect.options.length <= 1 && data.genres.length) {
      data.genres.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; genreSelect.appendChild(o); });
    }
  } catch {}
}

async function loadFavorites() {
  if (!token) return;
  const data = await api('/content');
  const favs = data.items.filter(c => c.is_favorite);
  document.getElementById('favorites-grid').innerHTML = favs.length
    ? favs.map(c => renderCard(c)).join('')
    : '<p style="color:#888;grid-column:1/-1;text-align:center;padding:40px">No favorites yet</p>';
}

function renderCard(c) {
  const year = c.release_year ? ` · ${c.release_year}` : '';
  const badge = c.type === 'movie' ? '<span class="badge">Movie</span>' : '<span class="badge">Show</span>';
  const poster = c.poster_url ? `<img src="${c.poster_url}" alt="${c.title}">` : '🎬';
  return `<div class="content-card" onclick="playContent(${c.id})">
    ${badge}
    <div class="poster">${poster}</div>
    <div class="info"><h3>${c.title}</h3><p>${c.genre || 'General'}${year}</p></div>
  </div>`;
}

async function playContent(id) {
  try {
    const item = await api(`/content/${id}`);
    document.getElementById('hero-title').textContent = item.title;
    document.getElementById('hero-desc').textContent = item.description || 'No description available';
    document.getElementById('player-info').innerHTML = `<h2>${item.title}</h2><p>${item.description || ''}</p>`;

    if (item.is_favorite !== undefined) {
      const favBtn = document.createElement('button');
      favBtn.className = 'back-btn';
      favBtn.style.marginTop = '12px';
      favBtn.textContent = item.is_favorite ? '❤️ Remove from Favorites' : '🤍 Add to Favorites';
      favBtn.onclick = async () => {
        try {
          if (item.is_favorite) { await api(`/content/${id}/favorite`, { method: 'DELETE' }); item.is_favorite = 0; }
          else { await api(`/content/${id}/favorite`, { method: 'POST' }); item.is_favorite = 1; }
          favBtn.textContent = item.is_favorite ? '❤️ Remove from Favorites' : '🤍 Add to Favorites';
        } catch {}
      };
      document.getElementById('player-info').appendChild(favBtn);
    }

    showPage('player');

    if (player) player.dispose();
    if (item.hls_path) {
      player = videojs('video-player', {
        sources: [{ src: item.hls_path, type: 'application/x-mpegURL' }],
        html5: { hls: { enableLowInitialPlaylist: true } }
      });
      player.ready(() => {
        if (token) {
          api(`/content/${id}/continue`).then(h => {
            if (h && h.progress_seconds > 10) {
              player.currentTime(h.progress_seconds);
            }
          }).catch(() => {});
        }
        player.on('timeupdate', () => {
          if (token && Math.floor(player.currentTime()) % 15 === 0) {
            const progress = player.currentTime();
            const duration = player.duration();
            api(`/content/${id}/progress`, {
              method: 'POST',
              body: JSON.stringify({ progress_seconds: progress, completed: progress && duration ? (progress / duration > 0.9 ? 1 : 0) : 0 })
            }).catch(() => {});
          }
        });
      });
    }
  } catch (e) { alert('Error loading content: ' + e.message); }
}

async function uploadContent() {
  const title = document.getElementById('ad-title').value;
  const desc = document.getElementById('ad-desc').value;
  const genre = document.getElementById('ad-genre').value;
  const year = document.getElementById('ad-year').value;
  const type = document.getElementById('ad-type').value;
  const poster = document.getElementById('ad-poster').value;
  const file = document.getElementById('ad-video').files[0];

  if (!title || !file) { document.getElementById('ad-error').textContent = 'Title and video required'; return; }

  try {
    const content = await api('/content', {
      method: 'POST',
      body: JSON.stringify({ title, description: desc, genre, release_year: Number(year) || null, type, poster_url: poster || null })
    });

    const formData = new FormData();
    formData.append('video', file);
    formData.append('content_id', content.id);

    const res = await fetch(`${API}/upload/video`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    document.getElementById('ad-error').textContent = '';
    document.getElementById('ad-error').style.color = '#4caf50';
    document.getElementById('ad-error').textContent = `Uploaded! ${result.hls_path}`;
    setTimeout(() => { document.getElementById('ad-error').textContent = ''; document.getElementById('ad-error').style.color = '#e50914'; }, 3000);
  } catch (e) { document.getElementById('ad-error').textContent = e.message; }
}

document.getElementById('ad-type').addEventListener('change', function() {
  document.getElementById('ad-episode').style.display = this.value === 'show' ? 'block' : 'none';
  document.getElementById('ad-season').style.display = this.value === 'show' ? 'block' : 'none';
});

// Init
updateNav();
loadContent();
