const fs = require('fs');
const html = fs.readFileSync('C:/Users/blazi/.zed/projects/streaming-platform/public/index.html', 'utf-8');
const js = fs.readFileSync('C:/Users/blazi/.zed/projects/streaming-platform/public/js/app.js', 'utf-8');

// Extract all id="..." from HTML
const htmlIds = new Set();
const idRegex = /id="([a-zA-Z][a-zA-Z0-9_-]*)"/g;
let m;
while ((m = idRegex.exec(html)) !== null) htmlIds.add(m[1]);

// Extract all getElementById('...') from JS
const jsIds = new Set();
const jsIdRegex = /getElementById\(['"]([\w-]+)['"]\)/g;
while ((m = jsIdRegex.exec(js)) !== null) jsIds.add(m[1]);

// Find JS refs that don't have HTML elements
const missing = [...jsIds].filter(id => !htmlIds.has(id));
// Find HTML elements not used by JS (informational)
const unused = [...htmlIds].filter(id => !jsIds.has(id));

console.log('=== JS references missing HTML elements ===');
missing.forEach(id => console.log('  ✗ ' + id));
console.log('\n=== HTML elements not used by JS (just info) ===');
unused.slice(0, 20).forEach(id => console.log('  - ' + id));
console.log('\nTotal HTML ids:', htmlIds.size, '| Total JS refs:', jsIds.size);
