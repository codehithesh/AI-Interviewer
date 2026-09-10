// ============================================================
// Appearance — follow the OS, or force light / dark
// ============================================================
// Switching previews the theme immediately, but the choice is only remembered
// when you press Save in Settings (see js/settings.js and js/store.js).

'use strict';

const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

// the theme currently on screen (may be an unsaved preview)
let uiThemePref = 'system'; // 'system' | 'light' | 'dark'

function effectiveTheme() {
  if (uiThemePref === 'light') return 'light';
  if (uiThemePref === 'dark') return 'dark';
  return darkMQ.matches ? 'dark' : 'light';
}

function renderTheme() {
  document.documentElement.setAttribute('data-theme', effectiveTheme());
  els.themeSystem.classList.toggle('active', uiThemePref === 'system');
  els.themeLight.classList.toggle('active', uiThemePref === 'light');
  els.themeDark.classList.toggle('active', uiThemePref === 'dark');
}

function previewThemePref(p) {
  uiThemePref = p;
  renderTheme();
}

// what the saved preferences say (read after boot has loaded them)
function syncThemePref() { previewThemePref(prefs ? prefs.theme : 'system'); }

function initTheme() {
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', renderTheme); // live OS switch
}
