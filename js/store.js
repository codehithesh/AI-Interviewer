// ============================================================
// SAVE STORE — chrome.storage.local in the extension, localStorage outside it
// ============================================================
// The settings modal edits a draft (see js/settings.js); nothing reaches storage
// until you press Save. Saving remembers all of it: API keys, the chosen
// provider, the chosen model per provider, and the light/dark appearance choice.
// “Forget saved keys” erases the keys alone and leaves those preferences standing.
// Keys are not encrypted on purpose: inside the extension this storage area is
// already private to it — a stored encryption key would protect against nothing
// extra.
//
// Outside the extension (a plain file:// or http:// tab) there is no private
// place to keep a key, so preferences — the key included — go to localStorage and
// persist exactly as they do in the extension. “Forget saved keys” is the eraser
// in both builds.
//
// The one thing worth knowing: localStorage is scoped to the origin, and a GitHub
// Pages site is served from a shared <user>.github.io origin, so another project
// published under the same account could read what this one writes. That is the
// price of persisting on a web page, and the reason the extension's own storage
// area exists. Nothing the app renders reaches the DOM as HTML — article text and
// model output are all set with textContent — so a hostile page cannot be used to
// script the key back out through this app.

'use strict';

const STORE = {
  keys: 'rlApiKeys',
  provider: 'rlProvider',
  models: 'rlModels',
  theme: 'rlTheme',
};

const THEMES = ['system', 'light', 'dark'];

// A hand-edited or half-written entry must not take the other preferences down
// with it, so each value is parsed on its own.
function readJson(area, name) {
  try { return JSON.parse(area.getItem(name) || 'null'); } catch { return null; }
}

function blankPrefs() {
  return { keys: {}, provider: state.provider, models: {}, theme: 'system' };
}

// Accept only what we recognise, so a hand-edited storage entry cannot break boot.
function shapePrefs(raw) {
  const p = blankPrefs();
  if (raw.keys && typeof raw.keys === 'object') {
    for (const prov of PROVIDERS) {
      const v = raw.keys[prov.id];
      if (typeof v !== 'string') continue;
      // a key saved by an older build may still hold unmailable characters
      const { key } = sanitizeKey(v);
      if (key) p.keys[prov.id] = key;
    }
  }
  if (PROVIDER_MAP[raw.provider]) p.provider = raw.provider;
  if (raw.models && typeof raw.models === 'object') {
    for (const prov of PROVIDERS) {
      const m = raw.models[prov.id];
      if (typeof m === 'string' && prov.models.some((x) => x.v === m)) p.models[prov.id] = m;
    }
  }
  if (THEMES.indexOf(raw.theme) >= 0) p.theme = raw.theme;
  return p;
}

async function loadPrefs() {
  let raw = {};
  if (isExt) {
    try { raw = await chrome.storage.local.get(Object.values(STORE)) || {}; } catch { raw = {}; }
  } else {
    // plain browser tab: the same four values, in localStorage
    try {
      raw = {
        [STORE.keys]: readJson(localStorage, STORE.keys),
        [STORE.provider]: localStorage.getItem(STORE.provider) || undefined,
        [STORE.models]: readJson(localStorage, STORE.models),
        [STORE.theme]: localStorage.getItem(STORE.theme) || undefined,
      };
    } catch { raw = {}; }
  }
  return shapePrefs({
    keys: raw[STORE.keys],
    provider: raw[STORE.provider],
    models: raw[STORE.models],
    theme: raw[STORE.theme],
  });
}

async function writePrefs(p) {
  const keys = Object.keys(p.keys).length ? p.keys : null;
  const models = Object.keys(p.models).length ? p.models : null;
  if (!isExt) {
    // same four values, same meanings as the extension branch below — this build
    // just has localStorage instead of chrome.storage.local
    try {
      localStorage.setItem(STORE.provider, p.provider);
      localStorage.setItem(STORE.theme, p.theme);
      if (models) localStorage.setItem(STORE.models, JSON.stringify(models));
      else localStorage.removeItem(STORE.models);
      if (keys) localStorage.setItem(STORE.keys, JSON.stringify(keys));
      else localStorage.removeItem(STORE.keys); // emptied → gone for good
    } catch { /* ignore */ }
    return;
  }
  try {
    await chrome.storage.local.set({ [STORE.provider]: p.provider, [STORE.theme]: p.theme });
    if (models) await chrome.storage.local.set({ [STORE.models]: models });
    else await chrome.storage.local.remove(STORE.models);
    if (keys) await chrome.storage.local.set({ [STORE.keys]: keys });
    else await chrome.storage.local.remove(STORE.keys); // emptied → gone for good
  } catch { /* storage unavailable — stay in-memory only */ }
}

// Erase the saved keys from wherever they live.
async function eraseSavedKeys() {
  if (!isExt) {
    try { localStorage.removeItem(STORE.keys); } catch { /* ignore */ }
    return;
  }
  try { await chrome.storage.local.remove(STORE.keys); } catch { /* ignore */ }
}
