// Embed Proxy — transparent 302 redirect to the provider URL.
// The provider URL is never exposed in the page HTML.

const ALLOWED_DOMAINS = [
  'vidsrc.to', 'autoembed.co', 'vidlink.pro',
  '111movies.net', '111movies.com',
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

  res.redirect(302, decodedUrl);
}

module.exports = { proxyEmbed };
