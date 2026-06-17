export const API = '/api';

export function sanitize(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (opts.nojson) delete headers['Content-Type'];
  const res = await fetch(`${API}${path}`, { ...opts, headers, credentials: 'include' });
  if (opts.nojson) return res;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return dateStr;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
