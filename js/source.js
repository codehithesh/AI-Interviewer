// ============================================================
// SOURCE — how text arrives
// ============================================================
// Owns the Add source text modal and the three ways a source is acquired:
//
//   1 · the paste tab        — text the user typed or pasted in;
//   2 · the URL tab          — an address the service worker opens in a hidden
//                              tab and reads (see background.js);
//   3 · a toolbar click      — text the active tab handed over, collected by
//                              consumePendingGrab() on load.
//
// Every path ends by calling loadSource(), which lives in js/reader.js. This
// file acquires; the reader renders. Nothing here touches the reading pane.

'use strict';

// ---------- modal state ----------
// Which tab is showing decides what Load text does. The choice is kept between
// openings, so someone loading a run of articles is not sent back to the paste
// tab every time.
let sourceTab = 'paste';

// A page opened straight from disk (file://) or over http:// cannot read other
// websites at all — cross-origin access is the extension's privilege, not the
// page's. Rather than let the URL tab fail confusingly in that build, it is
// disabled with the reason stated.
function configureUrlTab() {
  if (isExt) return;
  els.tabUrl.disabled = true;
  els.tabUrl.title = 'Available in the browser extension';
  els.urlInput.disabled = true;
  els.urlHint.textContent = 'Loading from a URL needs the browser extension: a page opened from disk is not allowed to read other websites.';
}

function switchSourceTab(name) {
  if (name === 'url' && els.tabUrl.disabled) return;
  sourceTab = name;
  const paste = name === 'paste';
  els.tabPaste.classList.toggle('active', paste);
  els.tabUrl.classList.toggle('active', !paste);
  els.tabPaste.setAttribute('aria-selected', String(paste));
  els.tabUrl.setAttribute('aria-selected', String(!paste));
  els.panePaste.classList.toggle('hidden', !paste);
  els.paneUrl.classList.toggle('hidden', paste);
  (paste ? els.pasteText : els.urlInput).focus();
}

function openSourceModal() {
  openModal(els.sourceModal);
  switchSourceTab(sourceTab); // also moves focus to the showing tab's field
}

// ---------- the URL tab ----------
// "example.com/article" is accepted and completed to https://; anything that is
// still not http(s) after that is refused rather than silently mangled.
function normalizeUrl(raw) {
  const s = (raw || '').trim();
  if (!s || /\s/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Ask for the one site the user typed.
//
// The manifest declares http://*/* and https://*/* as *optional* host access, so
// requesting a single origin out of them is accepted — unlike <all_urls>, which
// Chrome refuses to treat as containing a specific origin ("Only permissions
// specified in the manifest may be requested"). A site already granted resolves
// true without prompting, so this is safe to call every time.
//
// Deliberately NOT async: chrome.permissions.request must be called in the same
// turn as the click, because awaiting anything first drains the user gesture the
// API requires. So this hands back the promise and the caller awaits it.
function askForSite(url) {
  let origin;
  try {
    origin = new URL(url).origin + '/*';
  } catch {
    return Promise.resolve({ ok: false, reason: 'bad-origin' });
  }

  if (!chrome || !chrome.permissions || !chrome.permissions.request) {
    return Promise.resolve({ ok: false, reason: 'no-api' });
  }

  try {
    return chrome.permissions.request({ origins: [origin] })
      .then((granted) => (granted ? { ok: true } : { ok: false, reason: 'declined' }))
      .catch((err) => ({ ok: false, reason: 'error', detail: String((err && err.message) || err) }));
  } catch (err) {
    return Promise.resolve({ ok: false, reason: 'error', detail: String((err && err.message) || err) });
  }
}

function permissionFailureMessage(access) {
  if (access.reason === 'declined') {
    return 'Reaction Learner needs permission for that site to read it. Nothing was loaded.';
  }
  if (access.reason === 'no-api') {
    return 'This build cannot ask for site access — reload the extension from chrome://extensions and try again.';
  }
  if (access.reason === 'bad-origin') return 'That address cannot be requested from a browser.';
  const detail = access.detail ? ' — ' + access.detail : '';
  return 'Could not get permission for that site' + detail +
    '. If you have just updated the extension, reload it from chrome://extensions so the manifest change takes effect.';
}

function fetchFailureMessage(res) {
  const reason = res && res.reason;
  if (reason === 'empty') return 'That page had no readable text — it may be a PDF, an image, or a page that needs a sign-in.';
  if (reason === 'blocked') return 'That page could not be read. PDFs, browser-internal pages and sites that block extensions cannot be loaded this way.';
  if (reason === 'scheme') return 'Only http:// and https:// addresses can be loaded.';
  return 'Could not read that page. Check the address and try again.';
}

function setSourceBusy(busy) {
  els.loadSource.disabled = busy;
  els.loadSource.textContent = busy ? 'Loading…' : 'Load text';
  els.urlInput.disabled = busy || !isExt;
}

// Called straight from the click (or the Enter key) while the gesture is still
// live: validating the address and raising the per-site prompt both happen before
// anything is awaited, which is what keeps chrome.permissions.request allowed.
function startUrlLoad() {
  if (!isExt) {
    setStatus('Loading from a URL needs the browser extension', 'error');
    return;
  }

  const url = normalizeUrl(els.urlInput.value);
  if (!url) {
    setStatus('Enter a web address, for example https://example.com/article', 'warn');
    els.urlInput.focus();
    return;
  }

  loadFromUrl(url, askForSite(url));
}

async function loadFromUrl(url, asking) {
  setSourceBusy(true);
  try {
    const access = await asking;
    if (!access.ok) {
      setStatus(permissionFailureMessage(access), 'error');
      return;
    }

    const res = await chrome.runtime.sendMessage({ type: 'fetch-url', url });
    if (res && res.ok && res.text && res.text.trim()) {
      loadSource(res.text, res.title || url, res.url || url);
      closeModal(els.sourceModal);
      els.urlInput.value = '';
      return;
    }
    setStatus(fetchFailureMessage(res), 'error');
  } catch {
    setStatus('Could not reach that page. Check the address and your connection.', 'error');
  } finally {
    setSourceBusy(false);
  }
}

// ---------- the paste tab ----------
function loadPastedText() {
  const text = els.pasteText.value.trim();
  if (!text) { setStatus('Paste some text first', 'warn'); return; }
  loadSource(text, 'Pasted text', '');
  els.pasteText.value = '';
  closeModal(els.sourceModal);
}

// ---------- grabbed page text (extension only) ----------
// The toolbar click stashes the page's text in chrome.storage.session and opens
// this page with a one-time token; read it, then drop it.
async function consumePendingGrab() {
  if (!isExt) return;
  const tok = new URLSearchParams(location.search).get('grab');
  if (!tok) return;
  try {
    const { pendingGrab } = await chrome.storage.session.get('pendingGrab');
    if (pendingGrab && pendingGrab.token === tok) {
      chrome.storage.session.remove('pendingGrab');
      if (pendingGrab.text && pendingGrab.text.trim()) {
        loadSource(pendingGrab.text, pendingGrab.title || '', pendingGrab.url || '');
        setStatus('Loaded text from the page you opened this from', 'success');
      } else {
        setStatus('Nothing readable was found on that page — use the + button to paste instead.', 'warn');
      }
    } else if (pendingGrab) {
      chrome.storage.session.remove('pendingGrab'); // stale token
    }
  } catch { /* non-extension context — ignore */ }
}

// ---------- wiring ----------
function wireSource() {
  configureUrlTab();

  els.btnSource.addEventListener('click', openSourceModal);

  els.sourceTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-source-tab]');
    if (btn) switchSourceTab(btn.dataset.sourceTab);
  });

  els.loadSource.addEventListener('click', () => {
    if (sourceTab === 'url') startUrlLoad();
    else loadPastedText();
  });

  // Enter in the URL field loads, the same as pressing the button. A keydown is
  // a user gesture too, so the per-site permission prompt is still allowed.
  els.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startUrlLoad(); }
  });
}
