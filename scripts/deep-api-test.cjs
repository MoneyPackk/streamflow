const https = require('https');
const URLS = [
  '/', '/api/tmdb/trending', '/api/tmdb/now_playing', '/api/tmdb/on_the_air',
  '/api/tmdb/top_rated?type=movie', '/api/tmdb/top_rated?type=tv',
  '/api/tmdb/upcoming?region=US', '/api/tmdb/airing_today',
  '/api/tmdb/new_releases?region=US&type=movie', '/api/tmdb/genres?type=movie',
  '/api/tmdb/search?q=Fight+Club', '/api/tmdb/550?type=movie',
  '/api/tmdb/1396?type=tv', '/api/tmdb/324109?type=tv',
  '/api/tmdb/550/season/1', '/api/embed/550?type=movie',
  '/api/embed/1396?type=tv&season=1&episode=1',
  '/api/embed/324109?type=tv&season=1&episode=1',
  '/api/auth/me',
];

let passed = 0, failed = 0, failures = [];

function fetch(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(`https://moneypack.wtf${path}`, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, time: Date.now() - start, body: data }));
    });
    req.on('error', e => resolve({ status: 0, time: Date.now() - start, error: e.message }));
    req.end();
  });
}

async function checkEndpoint(path, expectedStatus, expectedFn) {
  const r = await fetch(path);
  let pass = r.status === expectedStatus;
  if (pass && expectedFn) pass = expectedFn(r);
  if (!pass) {
    failed++;
    failures.push(`${path}: exp=${expectedStatus} got=${r.status}${r.error ? ' err='+r.error : ''}`);
  } else passed++;
}

async function run() {
  for (const url of URLS) {
    if (url.includes('/auth/me')) {
      await checkEndpoint(url, 401);
    } else if (url.includes('/embed/')) {
      await checkEndpoint(url, 200, r => { try { return JSON.parse(r.body).sources?.length >= 8; } catch { return false; } });
    } else if (url.includes('/search?q=')) {
      await checkEndpoint(url, 200, r => { try { return JSON.parse(r.body).items?.length > 0; } catch { return false; } });
    } else if (url.includes('/genres')) {
      await checkEndpoint(url, 200, r => { try { return Array.isArray(JSON.parse(r.body)) && JSON.parse(r.body).length >= 10; } catch { return false; } });
    } else if (url.includes('/trending') || url.includes('/now_playing') || url.includes('/top_rated') || url.includes('/new_releases')) {
      await checkEndpoint(url, 200, r => { try { return JSON.parse(r.body).items?.length > 0; } catch { return false; } });
    } else if (url.includes('/season/')) {
      await checkEndpoint(url, 200, r => { try { return JSON.parse(r.body).episodes?.length > 0; } catch { return false; } });
    } else {
      await checkEndpoint(url, 200);
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log(`\nFAILURES:`);
    failures.forEach(f => console.log(`  ❌ ${f}`));
  }

  // Exit with error if any failures
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
