// Embed Proxy — routes third-party embed through our server
// Strips ad scripts, controls headers, blocks trackers
const axios = require('axios');
const { JSDOM } = require('jsdom');

async function fetchAndCleanEmbed(embedUrl) {
  try {
    const res = await axios.get(embedUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'text',
    });

    let html = res.data;

    // Remove known ad/tracker scripts
    const adDomains = [
      'llvpn.com', 'cloudnestra.com', 'cloudorchestranova.com',
      'boopigcdn.com', 'exosrv.com', 'soulnetwork.com',
      'trafficfactor.com', 'clicksor.com', 'popads.net',
      'propellerads.com', 'adsterra.com', 'adcash.com',
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'adnxs.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
      'casalemedia.com', 'sharethrough.com', 'taboola.com', 'outbrain.com',
      'popcash.net', 'hilltopads.com', 'clickadu.com', 'exoclick.com',
      'juicyads.com', 'trafficjunky.com', 'trafficfactory.biz',
    ];

    adDomains.forEach(domain => {
      const regex = new RegExp(`<script[^>]*src=["'][^"']*${domain.replace(/\./g, '\\.')}[^"']*["'][^>]*>\\s*<\\/script>`, 'gi');
      html = html.replace(regex, '');
    });

    // Remove script tags containing ad-related code
    html = html.replace(/<script[^>]*>[\s\S]*?(popunder|popup|advertisement|ad\.\w+|window\.open)[\s\S]*?<\/script>/gi, '');

    // Remove iframes pointing to ad domains
    adDomains.forEach(domain => {
      const regex = new RegExp(`<iframe[^>]*src=["'][^"']*${domain.replace(/\./g, '\\.')}[^"']*["'][^>]*>\\s*<\\/iframe>`, 'gi');
      html = html.replace(regex, '');
    });

    return html;
  } catch (e) {
    return null;
  }
}

async function proxyEmbed(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  const decodedUrl = decodeURIComponent(url);
  
  // Only allow known embed domains
  const allowedPrefixes = [
    'https://vidlink.pro/', 'https://vidsrc.to/', 'https://www.2embed.cc/',
    'https://ezvidapi.com/', 'https://multiembed.mov/', 'https://vidbinge.dev/',
    'https://embed.su/', 'https://player.smashy.stream/', 'https://autoembed.co/',
    'https://moviesapi.club/', 'https://111movies.com/', 'https://rivestream.org/',
    'https://vidara.to/', 'https://vidsrc.cc/',
  ];
  
  if (!allowedPrefixes.some(p => decodedUrl.startsWith(p))) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  const cleaned = await fetchAndCleanEmbed(decodedUrl);
  if (!cleaned) {
    // Fallback: redirect directly to the embed URL
    return res.redirect(decodedUrl);
  }

  // Inject CSP meta tag to block remaining ads
  const cspMeta = '<meta http-equiv="Content-Security-Policy" content="default-src * \'unsafe-inline\' \'unsafe-eval\'; script-src * \'unsafe-inline\' \'unsafe-eval\'; img-src * data: blob:; media-src * blob: data:;">';
  const finalHtml = cleaned.replace('</head>', `${cspMeta}</head>`);

  // Set security headers
  res.set({
    'Content-Type': 'text/html',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  res.send(finalHtml);
}

module.exports = { proxyEmbed, fetchAndCleanEmbed };
