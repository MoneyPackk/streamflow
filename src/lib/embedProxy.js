// Embed Proxy — transparent 302 redirect to the provider URL.
// We do NOT fetch and modify the HTML server-side. That breaks JS players
// because cross-origin requests fail when served from our domain.
// Instead we redirect, letting the browser load the embed directly.
// The provider URL is never exposed in the page HTML — the iframe src
// points to our endpoint, and the 302 happens at the HTTP level.

const ALLOWED_DOMAINS = [
  'vidsrc.cc', 'vidsrc.to', 'autoembed.co', 'vidlink.pro',
  'embed.su', 'multiembed.mov', 'player.smashy.stream',
  'moviesapi.club', 'www.2embed.cc', '111movies.com',
  'rivestream.org', 'vidara.to',
];

async function proxyEmbed(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  const decodedUrl = decodeURIComponent(url);

  let parsed;
  try {
    parsed = new URL(decodedUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const allowed = ALLOWED_DOMAINS.some(d =>
    parsed.hostname === d || parsed.hostname.endsWith('.' + d)
  );
  if (!allowed) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  // Transparent redirect — browser loads the embed directly in the iframe.
  // This preserves the provider's JS player, Cloudflare challenges, and all
  // functionality that breaks when we try to fetch+serve modified HTML.
  res.redirect(302, decodedUrl);
}

module.exports = { proxyEmbed };
