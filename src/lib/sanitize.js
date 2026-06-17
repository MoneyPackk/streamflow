const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return DOMPurify.sanitize(str);
}

module.exports = { sanitize, sanitizeHtml };
