// ============================================================
// DOM plumbing — element cache, modals, toast
// ============================================================

'use strict';

const $ = (id) => document.getElementById(id);

// Filled in by cacheEls() during boot, once every view has been mounted.
const els = {};

function cacheEls() {
  Object.assign(els, {
    toastStack: $('toast-stack'),

    // the interview screen as a whole — data-state is 'ready' | 'live' | 'done'
    view: $('im-view'),
    timer: $('im-timer'),

    // transcript + composer
    transcript: $('im-transcript'), status: $('im-status'), hint: $('im-hint'),
    imText: $('im-text'),
    btnPlus: $('im-plus'), btnMic: $('im-mic'), btnCam: $('im-cam'), btnSend: $('im-send'),
    btnPrimary: $('im-primary'),

    // participants rail
    wiggle: $('im-wiggle'),
    candidateTile: $('im-candidate-tile'),
    video: $('im-video'), initials: $('im-initials'),

    // speech bar, directly under the header
    btnRead: $('btn-read'), btnPause: $('btn-pause'), btnStop: $('btn-stop'),
    voiceSelect: $('voice-select'), rateSelect: $('rate-select'), autoSpeak: $('auto-speak'),

    // export, mounted in the header
    exportMenu: $('export-menu'), btnExport: $('btn-export'),

    // code editor popup
    codeModal: $('im-code-modal'), codeInput: $('im-code'),
    btnCodeSend: $('im-code-send'), btnCodeClose: $('im-code-close'),

    // settings modal
    btnSettings: $('btn-settings'), btnSaveSettings: $('btn-save-settings'), btnCloseSettings: $('btn-close-settings'),
    settingsModal: $('settings-modal'),
    themeSystem: $('theme-system'), themeLight: $('theme-light'), themeDark: $('theme-dark'),
    providerList: $('provider-list'),
    apiError: $('api-error'),
    btnForgetKeys: $('btn-forget-keys'),
  });

  // Every id the behaviour modules reach for. A missing one means a view did not
  // mount — and caching null silently is exactly what turns that into a blank
  // page with no explanation, so fail here naming them instead.
  const missing = Object.keys(els).filter((k) => !els[k]);
  if (missing.length) {
    throw new Error('missing elements: ' + missing.join(', ') + ' (a view did not mount)');
  }
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
//    user: a permission prompt they are still reading, a dead API key. It can
//    arrive while their attention is elsewhere.
//  · 'warn' clears itself after TOAST_MS. It is a nudge about what to do next —
//    those are falsified by the very next successful action, so a sticky one
//    would sit in the stack asserting something no longer true.
//
// Two guards keep the stack honest: the same message is not posted twice in a
// row (the mic and the voice re-announce the same thing on a retry), and the
// stack is capped in height and scrolls rather than growing over the chat.

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
  // textContent, never innerHTML: these messages carry model output and provider
  // errors, which is exactly what must not be parsed as markup
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
