// ============================================================
// SETTINGS — provider cards, saved preferences, the Settings modal
// ============================================================
// The modal always edits a draft; storage is only touched by Save. Closing
// without saving throws the draft away and restores the last saved state.

'use strict';

let prefs = null;  // what is currently stored (or would be, in a plain tab)
let draft = null;  // what the open settings modal is editing

function savedKeys() { return (prefs && prefs.keys) || {}; }

function updateForgetBtn() {
  const anySaved = Object.keys(savedKeys()).length > 0;
  const anyTyped = PROVIDERS.some((p) => {
    const el = providerInput(p.id);
    return !!el && !!el.value.trim();
  });
  els.btnForgetKeys.disabled = !anySaved && !anyTyped;
}

// ---------- provider cards ----------
function renderProviderCards() {
  els.providerList.innerHTML = PROVIDERS.map((p) => {
    const opts = modelOptions(p, draft ? draft.models[p.id] : '');
    return `
      <div class="provider-card${p.id === state.provider ? ' active' : ''}" data-provider="${p.id}">
        <div class="pc-head">
          <span class="pc-radio"></span>
          <span class="pc-name">${p.label}</span>
          <span class="pc-models">${p.models.map((m) => m.l).join(' · ')}</span>
        </div>
        <label for="key-${p.id}">API key</label>
        <input type="password" id="key-${p.id}" placeholder="${p.ph || 'Paste your API key'}" autocomplete="off" spellcheck="false">
        <label for="model-${p.id}">Model</label>
        <select id="model-${p.id}">${opts}</select>
        ${p.hint ? `<p class="hint">${p.hint}</p>` : ''}
      </div>`;
  }).join('\n');
}

function selectProvider(prov) {
  if (draft) draft.provider = prov;
  state.provider = prov;
  document.querySelectorAll('.provider-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.provider === prov);
  });
  setApiError('');
}

// ---------- draft <-> stored preferences ----------
// the modal always opens on exactly what is stored
function draftFromPrefs() {
  draft = {
    keys: Object.assign({}, prefs.keys),
    provider: prefs.provider,
    models: Object.assign({}, prefs.models),
    theme: prefs.theme,
  };
}

function applyDraftToInputs() {
  if (!draft) return;
  for (const p of PROVIDERS) {
    providerInput(p.id).value = draft.keys[p.id] || '';
    const def = draft.models[p.id] || p.def || p.models[0].v;
    const sel = providerModel(p.id);
    if (p.models.some((m) => m.v === def)) sel.value = def;
  }
  selectProvider(draft.provider);
  previewThemePref(draft.theme);
  updateForgetBtn();
}

async function saveSettings() {
  let dropped = 0;
  if (draft) {
    for (const p of PROVIDERS) {
      const field = providerInput(p.id);
      const { key, removed } = sanitizeKey(field.value);
      dropped += removed;
      if (removed) field.value = key;  // show back exactly what will be stored
      if (key) draft.keys[p.id] = key; else delete draft.keys[p.id];
      draft.models[p.id] = providerModel(p.id).value;
    }
    draft.provider = state.provider;
    draft.theme = uiThemePref;
  }
  prefs = shapePrefs(draft || prefs);
  await writePrefs(prefs);
  syncThemePref();
  updateForgetBtn();
  // say so when a key had to be repaired — the alternative is a user staring at
  // an unchanged-looking field wondering why the provider rejected it
  const note = dropped
    ? ` — dropped ${dropped} character${dropped === 1 ? '' : 's'} that cannot be in a key`
    : '';
  // both builds persist now — only the storage area behind them differs
  setStatus('Saved — keys, provider, models and appearance kept in this browser' + note, 'success');
  closeModal(els.settingsModal);
}

// closed without saving → every pending edit is discarded
function closeSettings() {
  closeModal(els.settingsModal);
  if (!prefs) return;
  draftFromPrefs();
  applyDraftToInputs();
  setApiError('');
}

async function forgetKeys() {
  for (const p of PROVIDERS) providerInput(p.id).value = '';
  const wasDraft = draft;
  if (wasDraft) wasDraft.keys = {};
  // only the keys go: provider / model / appearance picks are a separate choice
  prefs = shapePrefs(wasDraft || prefs || {});
  draftFromPrefs();
  updateForgetBtn();
  setApiError('');
  await eraseSavedKeys();
  setStatus('Saved API keys erased from this browser', 'success');
}

// ---------- wiring ----------
function wireSettings() {
  // Pick a provider: click its header, or focus its key field / model list.
  els.settingsModal.addEventListener('click', (e) => {
    const head = e.target.closest('.pc-head');
    if (head) selectProvider(head.closest('.provider-card').dataset.provider);
  });
  els.settingsModal.addEventListener('focusin', (e) => {
    const card = e.target.closest('.provider-card');
    if (card && draft && e.target.matches('input, select')) selectProvider(card.dataset.provider);
  });
  // Typing a key never writes to storage — Save does that. Junk characters that
  // arrived with a paste are stripped as they land, with the caret put back
  // where it was, so the field only ever shows a key that can actually be sent.
  els.settingsModal.addEventListener('input', (e) => {
    if (!e.target.matches('input[type="password"]')) return;
    const { key, removed } = sanitizeKey(e.target.value);
    if (removed) {
      const caret = sanitizeKey(e.target.value.slice(0, e.target.selectionStart)).key.length;
      e.target.value = key;
      e.target.setSelectionRange(caret, caret);
    }
    setApiError('');
    updateForgetBtn();
  });
  // remembering a model choice is part of the draft too
  els.settingsModal.addEventListener('change', (e) => {
    if (draft && e.target.matches('select[id^="model-"]')) {
      draft.models[e.target.id.slice('model-'.length)] = e.target.value;
    }
  });

  els.themeSystem.addEventListener('click', () => previewThemePref('system'));
  els.themeLight.addEventListener('click', () => previewThemePref('light'));
  els.themeDark.addEventListener('click', () => previewThemePref('dark'));

  els.btnSettings.addEventListener('click', () => {
    if (!prefs) prefs = blankPrefs();
    draftFromPrefs();
    applyDraftToInputs();
    setApiError('');
    openModal(els.settingsModal);
  });
  els.btnSaveSettings.addEventListener('click', saveSettings);
  els.btnCloseSettings.addEventListener('click', closeSettings);
  els.btnForgetKeys.addEventListener('click', forgetKeys);
}

// Load what was saved, paint it, and render the modal's contents.
async function initSettings() {
  prefs = await loadPrefs();  // saved keys + provider + models + theme
  state.provider = prefs.provider;
  syncThemePref();            // paint the saved appearance
  renderProviderCards();      // model <option>s use the saved per-provider picks
  draftFromPrefs();
  applyDraftToInputs();       // the modal opens on exactly what is stored
  if (Object.keys(prefs.keys).length) {
    setStatus('Saved API keys restored — open Settings to review or erase them', 'success');
  }
}
