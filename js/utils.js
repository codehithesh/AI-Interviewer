// ============================================================
// Small pure helpers — no DOM, no state
// ============================================================

'use strict';

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- API keys ----------
// A key is pasted, and pastes from web pages, chat apps and password managers
// routinely carry characters a key can never contain: curly quotes, em dashes,
// non-breaking spaces, zero-width joiners. They survive .trim(), and then
// fetch() refuses the request with "String contains non ISO-8859-1 code point"
// — an error about headers, which says nothing about the key that filled them.
//
// So reduce a key to what it can possibly be: no whitespace, no control
// characters, nothing above Latin-1 (U+00FF is the last code point a header
// value may carry). Every character dropped here would have made the request
// throw anyway, so nothing legitimate is lost — while ASCII that some providers
// do use, like "+" and "/", is deliberately left alone.
//
// Returns the cleaned key and how many characters were thrown away, so callers
// can tell the user their paste was dirty instead of silently rewriting it.
function sanitizeKey(raw) {
  const s = typeof raw === 'string' ? raw : '';
  const key = s
    .replace(/[\s\u0000-\u001F\u007F]/g, '')  // \s already covers NBSP and friends
    .replace(/[^\u0000-\u00FF]/g, '');
  return { key, removed: s.length - key.length };
}

function fmtCount(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

function fmtPct(f) { return Math.round(f * 100) + '%'; }

function slug(s) {
  return (s || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'session';
}
