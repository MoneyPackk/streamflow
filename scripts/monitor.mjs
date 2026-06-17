#!/usr/bin/env node
// PeacocksStreams — Hourly Bug Monitor

import https from 'https';
import http from 'http';
import fs from 'fs';

const BASE = 'https://moneypack.wtf';
const LOG_FILE = '/var/log/peacocks-monitor.log';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function fetch(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  const failures = [];

  // 1. Homepage
  try {
    const home = await fetch('/');
    if (home.status !== 200) failures.push(`Homepage returned ${home.status}`);
  } catch (e) { failures.push(`Homepage error: ${e.message}`); }

  // 2. TMDB trending
  try {
    const trending = await fetch('/api/tmdb/trending');
    if (trending.status !== 200) failures.push(`Trending returned ${trending.status}`);
    else {
      const body = JSON.parse(trending.body);
      if (!body.items?.length) failures.push('Trending returned 0 items');
    }
  } catch (e) { failures.push(`Trending error: ${e.message}`); }

  // 3. TMDB now_playing
  try {
    const np = await fetch('/api/tmdb/now_playing');
    if (np.status !== 200) failures.push(`NowPlaying returned ${np.status}`);
  } catch (e) { failures.push(`NowPlaying error: ${e.message}`); }

  // 4. Search
  try {
    const search = await fetch('/api/tmdb/search?q=Fight+Club');
    if (search.status !== 200) failures.push(`Search returned ${search.status}`);
    else {
      const body = JSON.parse(search.body);
      if (!body.items?.length) failures.push('Search returned 0 items');
    }
  } catch (e) { failures.push(`Search error: ${e.message}`); }

  // 5. Embed sources for a popular movie
  try {
    const embed = await fetch('/api/embed/550?type=movie');
    if (embed.status !== 200) failures.push(`Embed returned ${embed.status}`);
    else {
      const body = JSON.parse(embed.body);
      if (!body.sources?.length) failures.push('Embed returned 0 sources');
      else if (body.sources.length < 8) failures.push(`Only ${body.sources.length} embed sources`);
    }
  } catch (e) { failures.push(`Embed error: ${e.message}`); }

  // 6. Embed sources for TV
  try {
    const embedTv = await fetch('/api/embed/1396?type=tv&season=1&episode=1');
    if (embedTv.status !== 200) failures.push(`Embed TV returned ${embedTv.status}`);
  } catch (e) { failures.push(`Embed TV error: ${e.message}`); }

  // 7. Auth me (should 401 not logged in)
  try {
    const auth = await fetch('/api/auth/me');
    if (auth.status !== 401) failures.push(`Auth/me returned ${auth.status} (expected 401)`);
  } catch (e) { failures.push(`Auth error: ${e.message}`); }

  // 8. TMDB detail
  try {
    const detail = await fetch('/api/tmdb/550?type=movie');
    if (detail.status !== 200) failures.push(`TMDB detail returned ${detail.status}`);
  } catch (e) { failures.push(`TMDB detail error: ${e.message}`); }

  // 9. Genres endpoint
  try {
    const genres = await fetch('/api/tmdb/genres?type=movie');
    if (genres.status !== 200) failures.push(`Genres returned ${genres.status}`);
    else {
      const body = JSON.parse(genres.body);
      if (!Array.isArray(body) || body.length < 10) failures.push(`Only ${body.length} genres`);
    }
  } catch (e) { failures.push(`Genres error: ${e.message}`); }

  // 10. New releases
  try {
    const nr = await fetch('/api/tmdb/new_releases?region=US&type=movie');
    if (nr.status !== 200) failures.push(`NewReleases returned ${nr.status}`);
  } catch (e) { failures.push(`NewReleases error: ${e.message}`); }

  // Result
  if (failures.length === 0) {
    log('✅ ALL 10 CHECKS PASSED');
  } else {
    log(`❌ ${failures.length} FAILURES:\n  - ${failures.join('\n  - ')}`);
  }
}

run().catch(e => log(`FATAL: ${e.message}`));
