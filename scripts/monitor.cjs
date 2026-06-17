const https = require('https');
const fs = require('fs');

const LOG = 'C:\\Users\\blazi\\.zed\\peacocks-monitor.log';
const BASE = 'https://moneypack.wtf';

function log(m) {
  const l = `[${new Date().toISOString()}] ${m}`;
  console.log(l);
  fs.appendFileSync(LOG, l + '\n');
}

function fetch(p) {
  return new Promise(r => {
    const s = Date.now();
    const req = https.get(BASE + p, { timeout: 15000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => r({ s: res.statusCode, t: Date.now() - s, b: d }));
    });
    req.on('error', e => r({ s: 0, t: Date.now() - s, e: e.message }));
    req.end();
  });
}

async function run() {
  const f = [];
  const t = async (n, p, fn) => {
    const r = await fetch(p);
    const ok = r.s >= 200 && r.s < 400 && (!fn || fn(r));
    if (!ok) f.push(`${n}: got ${r.s}${r.e ? ' ('+r.e+')' : ''}`);
    return r;
  };

  await t('homepage', '/');
  await t('trending', '/api/tmdb/trending', r => { try { return JSON.parse(r.b).items?.length > 0; } catch { return false; } });
  await t('now_playing', '/api/tmdb/now_playing', r => { try { return JSON.parse(r.b).items?.length > 0; } catch { return false; } });
  await t('search', '/api/tmdb/search?q=Fight+Club', r => { try { return JSON.parse(r.b).items?.length > 0; } catch { return false; } });
  await t('movie embed', '/api/embed/550?type=movie', r => { try { return JSON.parse(r.b).sources?.length >= 8; } catch { return false; } });
  await t('tv embed', '/api/embed/1396?type=tv&season=1&episode=1', r => { try { return JSON.parse(r.b).sources?.length >= 8; } catch { return false; } });
  await t('genres', '/api/tmdb/genres?type=movie', r => { try { return JSON.parse(r.b).length >= 10; } catch { return false; } });
  await t('new releases', '/api/tmdb/new_releases?region=US&type=movie', r => { try { return JSON.parse(r.b).items?.length > 0; } catch { return false; } });

  if (f.length === 0) log('✅ ALL 8 CHECKS PASSED');
  else { log(`❌ ${f.length} FAILURES:`); f.forEach(x => log(`  ${x}`)); }
  process.exit(f.length);
}
run().catch(e => log('FATAL: ' + e.message));
