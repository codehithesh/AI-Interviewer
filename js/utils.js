// ============================================================
// Small pure helpers — no DOM, no state
// ============================================================

'use strict';

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

// ---------- text that lands in an attribute ----------
// The Settings provider cards are the one place this app still builds markup as a
// string. Their inputs carry a model ID the user typed (and that localStorage can
// hand back on the next boot), so a quote or an angle bracket in one must not be
// able to break out of the attribute it is written into. Everything the transcript
// renders goes through textContent or js/markdown.js instead, which is why this
// exists only for that one surface.
function escapeAttr(raw) {
  return String(raw == null ? '' : raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
