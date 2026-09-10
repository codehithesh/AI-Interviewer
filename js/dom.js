// ============================================================
// DOM plumbing — element cache, modals, toast
// ============================================================

'use strict';

const $ = (id) => document.getElementById(id);

// Filled in by cacheEls() during boot, once every pane has been mounted.
const els = {};

function cacheEls() {
  Object.assign(els, {
    toastStack: $('toast-stack'),
    btnSettings: $('btn-settings'), btnSaveSettings: $('btn-save-settings'), btnCloseSettings: $('btn-close-settings'),
    exportMenu: $('export-menu'), btnExport: $('btn-export'),
    btnSource: $('btn-source'),
    readerToolbar: $('reader-toolbar'), readPos: $('read-pos'), btnReact: $('btn-react'),
    voiceSelect: $('voice-select'), rateSelect: $('rate-select'),
    btnRead: $('btn-read'), btnPause: $('btn-pause'), btnStop: $('btn-stop'),
    reading: $('reading'),
    reactions: $('reactions'), reactHint: $('react-hint'),
    reactText: $('react-text'), btnMic: $('btn-mic'), btnSend: $('btn-send'),
    // full-screen reactions sheet
    reactionsCol: $('reactions-col'),
    btnCloseReactions: $('btn-close-reactions'),
    // modals
    sourceModal: $('source-modal'), settingsModal: $('settings-modal'),
    // source modal — markup in js/source-view.js, behaviour in js/source.js
    sourceTabs: $('source-tabs'), tabPaste: $('tab-paste'), tabUrl: $('tab-url'),
    panePaste: $('pane-paste'), paneUrl: $('pane-url'),
    pasteText: $('paste-text'), urlInput: $('url-input'), urlHint: $('url-hint'),
    loadSource: $('load-source'),
    themeSystem: $('theme-system'), themeLight: $('theme-light'), themeDark: $('theme-dark'),
    providerList: $('provider-list'),
    apiError: $('api-error'),
    btnForgetKeys: $('btn-forget-keys'),
  });
}

// ---------- modals (generic) ----------
function openModal(el) { el.classList.remove('hidden'); }
function closeModal(el) { el.classList.add('hidden'); }

function wireModals() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = document.getElementById(btn.dataset.close);
      if (overlay) closeModal(overlay);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
  });
}

// ---------- toasts ----------
// Toasts stack instead of replacing one another, and each carries its own ✕.
//
// Two kinds of problem message, told apart by how long they live rather than by
// how they look — both are red:
//
//  · 'error' stays until dismissed. It reports something that happened *to* the
//    user: a permission prompt they are still reading, a page that failed to
//    load, a dead API key. It can arrive while their attention is elsewhere, and
//    the URL-loading failures carry more text than a timed toast can be read in.
//  · 'warn' clears itself after TOAST_MS. It is a nudge about what to do next —
//    "Load a source text first", "Paste some text first". Those are falsified by
//    the very next successful action, so a sticky one would sit in the stack
//    asserting something no longer true. Every other message clears itself too.
//
// Two guards keep the stack honest:
//
//  · the same message is not posted twice in a row. The microphone and read-aloud
//    re-announce the same thing on a retry, and with stacking on, a literal
//    duplicate would simply sit there. The check looks only at the newest toast:
//    testing the whole stack would let an old copy swallow fresh news for as long
//    as it stays open — and for an error that is indefinitely.
//  · a long session can pile toasts up, so the stack is capped in height and
//    scrolls rather than growing over the reader.

const TOAST_MS = 6000;

function dismissToast(el) {
  if (!el) return;
  if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
  if (el.parentNode) el.parentNode.removeChild(el);
}

function closeAllToasts() {
  Array.from(els.toastStack.children).forEach(dismissToast);
}

function setStatus(msg, kind) {
  if (!msg) { closeAllToasts(); return; }

  const stack = els.toastStack;
  const newest = stack.lastElementChild;
  if (newest && newest.dataset.msg === msg) return;

  const el = document.createElement('div');
  const cls = kind === 'error' || kind === 'warn' ? ' error'      // same red for both
    : kind === 'success' ? ' success' : '';
  el.className = 'toast' + cls;
  el.dataset.msg = msg;
  // a problem is announced assertively, outranking the polite region it sits in
  if (kind === 'error' || kind === 'warn') el.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.className = 'toast-msg';
  // textContent, never innerHTML: these messages carry the titles and URLs of the
  // pages being read, which is exactly what must not be parsed as markup
  text.textContent = msg;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';

  el.appendChild(text);
  el.appendChild(close);
  stack.appendChild(el);
  stack.scrollTop = stack.scrollHeight; // the newest one is the one to read

  // only 'error' waits for its ✕; 'warn' and everything else clear themselves.
  // Dismissing by hand clears the pending timer, so a removed toast can never
  // fire one.
  if (kind !== 'error') {
    el._hideTimer = setTimeout(() => dismissToast(el), TOAST_MS);
  }
}

function wireToasts() {
  els.toastStack.addEventListener('click', (e) => {
    const btn = e.target.closest('.toast-close');
    if (btn) dismissToast(btn.closest('.toast'));
  });
}

function setApiError(msg) { els.apiError.textContent = msg || ''; }

function scrollBottom(el) { el.scrollTop = el.scrollHeight; }
