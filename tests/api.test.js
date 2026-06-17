const assert = require('assert');
const http = require('http');

const BASE = 'http://localhost:3000';

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {},
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    if (cookie) {
      opts.headers['Cookie'] = `token=${cookie}`;
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Store token between tests
let authToken = null;

// 1. Auth endpoints
async function testRegister() {
  const res = await request('POST', '/api/auth/register', {
    username: 'testuser',
    email: 'test@example.com',
    password: 'test123456',
  });
  assert.strictEqual(res.status, 201, 'Register should return 201');
  assert(res.body.user, 'Register should return user');
  assert.strictEqual(res.body.user.username, 'testuser');
  // Extract token from set-cookie
  const cookie = res.headers['set-cookie'];
  if (cookie) {
    const match = cookie[0].match(/token=([^;]+)/);
    if (match) authToken = match[1];
  }
  assert(authToken, 'Should receive auth cookie');
  console.log('  ✓ POST /api/auth/register');
}

async function testRegisterDuplicate() {
  const res = await request('POST', '/api/auth/register', {
    username: 'testuser',
    email: 'test@example.com',
    password: 'test123456',
  });
  assert.strictEqual(res.status, 409, 'Duplicate register should return 409');
  assert(res.body.error.includes('taken'), 'Should mention taken');
  console.log('  ✓ POST /api/auth/register (duplicate)');
}

async function testRegisterValidation() {
  const res = await request('POST', '/api/auth/register', {
    username: 'a',
    email: 'notanemail',
    password: '12',
  });
  assert.strictEqual(res.status, 400, 'Invalid register should return 400');
  console.log('  ✓ POST /api/auth/register (validation)');
}

async function testLogin() {
  const res = await request('POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'test123456',
  });
  assert.strictEqual(res.status, 200, 'Login should return 200');
  assert(res.body.user, 'Login should return user');
  const cookie = res.headers['set-cookie'];
  if (cookie) {
    const match = cookie[0].match(/token=([^;]+)/);
    if (match) authToken = match[1];
  }
  assert(authToken, 'Should receive auth cookie');
  console.log('  ✓ POST /api/auth/login');
}

async function testLoginInvalid() {
  const res = await request('POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'wrongpassword',
  });
  assert.strictEqual(res.status, 401, 'Invalid login should return 401');
  console.log('  ✓ POST /api/auth/login (invalid)');
}

async function testMe() {
  const res = await request('GET', '/api/auth/me', null, authToken);
  assert.strictEqual(res.status, 200, '/me should return 200');
  assert.strictEqual(res.body.username, 'testuser');
  console.log('  ✓ GET /api/auth/me');
}

async function testMeUnauthenticated() {
  const res = await request('GET', '/api/auth/me');
  assert.strictEqual(res.status, 401, '/me without auth should return 401');
  console.log('  ✓ GET /api/auth/me (unauthenticated)');
}

async function testLogout() {
  const res = await request('POST', '/api/auth/logout', {}, authToken);
  assert.strictEqual(res.status, 200, 'Logout should return 200');
  console.log('  ✓ POST /api/auth/logout');
}

// 2. TMDB endpoints
async function testTrending() {
  const res = await request('GET', '/api/tmdb/trending');
  assert.strictEqual(res.status, 200, 'Trending should return 200');
  assert(Array.isArray(res.body.items), 'Should return items array');
  assert(res.body.items.length > 0, 'Should have items');
  assert(res.body.items[0].tmdb_id, 'Items should have tmdb_id');
  assert(res.body.items[0].title, 'Items should have title');
  console.log('  ✓ GET /api/tmdb/trending');
}

async function testSearch() {
  const res = await request('GET', '/api/tmdb/search?q=matrix');
  assert.strictEqual(res.status, 200, 'Search should return 200');
  assert(Array.isArray(res.body.items), 'Should return items array');
  console.log('  ✓ GET /api/tmdb/search');
}

async function testSearchEmpty() {
  const res = await request('GET', '/api/tmdb/search');
  assert.strictEqual(res.status, 200, 'Empty search should return 200');
  assert.deepStrictEqual(res.body.items, [], 'Empty search should return empty array');
  console.log('  ✓ GET /api/tmdb/search (empty)');
}

async function testMovieDetails() {
  // Use a known TMDB ID (Matrix)
  const res = await request('GET', '/api/tmdb/603');
  assert.strictEqual(res.status, 200, 'Movie details should return 200');
  assert.strictEqual(res.body.type, 'movie');
  assert(res.body.title, 'Should have title');
  console.log('  ✓ GET /api/tmdb/:id (movie)');
}

async function testTVDetails() {
  // Use a known TV show TMDB ID (Breaking Bad)
  const res = await request('GET', '/api/tmdb/1396');
  assert.strictEqual(res.status, 200, 'TV details should return 200');
  assert.strictEqual(res.body.type, 'tv');
  assert(Array.isArray(res.body.seasons), 'Should have seasons array');
  console.log('  ✓ GET /api/tmdb/:id (tv show)');
}

async function testSeasonEpisodes() {
  const res = await request('GET', '/api/tmdb/1396/season/1');
  assert.strictEqual(res.status, 200, 'Season episodes should return 200');
  assert(Array.isArray(res.body.episodes), 'Should have episodes array');
  assert(res.body.episodes.length > 0, 'Should have episodes');
  console.log('  ✓ GET /api/tmdb/:id/season/:num');
}

// 3. Favorites endpoints
async function testAddFavorite() {
  const res = await request('POST', '/api/content/603/favorite', {
    title: 'The Matrix',
    poster_url: null,
    type: 'movie',
    release_year: 1999,
  }, authToken);
  assert.strictEqual(res.status, 201, 'Add favorite should return 201');
  console.log('  ✓ POST /api/content/:id/favorite');
}

async function testListFavorites() {
  const res = await request('GET', '/api/content/favorites/list', null, authToken);
  assert.strictEqual(res.status, 200, 'Favorites list should return 200');
  assert(Array.isArray(res.body), 'Should return array');
  const matrix = res.body.find(f => f.tmdb_id === 603);
  assert(matrix, 'Matrix should be in favorites');
  console.log('  ✓ GET /api/content/favorites/list');
}

async function testRemoveFavorite() {
  const res = await request('DELETE', '/api/content/603/favorite', null, authToken);
  assert.strictEqual(res.status, 200, 'Remove favorite should return 200');
  console.log('  ✓ DELETE /api/content/:id/favorite');
}

// 4. Embed endpoints
async function testEmbedMovie() {
  const res = await request('GET', '/api/embed/603?type=movie');
  assert.strictEqual(res.status, 200, 'Embed should return 200');
  assert(Array.isArray(res.body.sources), 'Should return sources array');
  assert(res.body.sources.length > 0, 'Should have sources');
  assert(res.body.sources[0].name, 'Sources should have name');
  assert(res.body.sources[0].url, 'Sources should have url');
  console.log('  ✓ GET /api/embed/:id');
}

async function testEmbedTV() {
  const res = await request('GET', '/api/embed/1396?type=tv&season=1&episode=1');
  assert.strictEqual(res.status, 200, 'TV embed should return 200');
  assert(res.body.sources[0].url.includes('tv'), 'TV embed should use tv path');
  console.log('  ✓ GET /api/embed/:id (tv)');
}

// 5. Rate limiting
async function testRateLimit() {
  const results = await Promise.all(
    Array(25).fill(null).map(() =>
      request('POST', '/api/auth/login', { email: 'test@example.com', password: 'test123456' })
    )
  );
  const has429 = results.some(r => r.status === 429);
  assert(has429, 'Should hit rate limit at some point');
  console.log('  ✓ Rate limiting (auth)');
}

// 6. Sanitization
async function testSanitization() {
  const { sanitize } = require('../src/lib/sanitize');
  assert.strictEqual(sanitize('<script>alert(1)</script>'), '', 'Should strip script tags');
  assert.strictEqual(sanitize('hello world'), 'hello world', 'Should keep safe text');
  assert.strictEqual(sanitize('<b>bold</b>'), 'bold', 'Should strip HTML tags');
  assert.strictEqual(sanitize(123), '', 'Should handle non-string input');
  console.log('  ✓ sanitize()');
}

async function run() {
  console.log('\n=== API Tests ===\n');

  // Auth
  await testRegister();
  await testRegisterDuplicate();
  await testRegisterValidation();
  await testLogin();
  await testLoginInvalid();
  await testMe();
  await testMeUnauthenticated();
  await testLogout();

  // Re-login for remaining tests
  await testLogin();

  // TMDB
  await testTrending();
  await testSearch();
  await testSearchEmpty();
  await testMovieDetails();
  await testTVDetails();
  await testSeasonEpisodes();

  // Favorites
  await testAddFavorite();
  await testListFavorites();
  await testRemoveFavorite();

  // Embed
  await testEmbedMovie();
  await testEmbedTV();

  // Rate limit
  await testRateLimit();

  // Sanitization
  await testSanitization();

  console.log('\n✓ All tests passed!\n');
}

run().catch(err => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
