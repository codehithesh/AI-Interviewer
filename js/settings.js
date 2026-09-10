// ============================================================
// SETTINGS — provider cards, saved preferences, the Settings modal
// ============================================================
// The modal always edits a draft; storage is only touched by Save. Closing
// without saving throws the draft away and restores the last saved state.
//
// The one exception is speech. The voice and the speed live in the speech bar
// under the nav bar, not in this modal, so they are applied and stored the moment
// they change — there is no Save step for them (see applySpeech / storeSpeech).

'use strict';

let prefs = null;  // what is currently stored
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

// ---------- speech ----------
// Speech is no longer edited in this modal: the voice and the speed live in the
// bar under the nav bar, so they take effect — and are stored — the moment they
// change. This paints the bar's controls from whatever is actually in force.
// autoSpeak has no control of its own and stays on: replies are read aloud as
// they arrive, and Read replays the newest one.
function applySpeech() {
  const s = (prefs && prefs.speech) || state.speech;
  state.speech = { voice: s.voice, rate: s.rate, autoSpeak: s.autoSpeak };
  els.voiceSelect.value = state.speech.voice;
  els.rateSelect.value = String(state.speech.rate);
}

// Store the bar's voice and speed at once — there is no Save step for them.
async function storeSpeech() {
  if (!prefs) prefs = blankPrefs();
  prefs = shapePrefs(Object.assign({}, prefs, { speech: Object.assign({}, state.speech) }));
  await writePrefs(prefs);
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
    if (sel && p.models.some((m) => m.v === def)) sel.value = def;
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
  // Speech is not part of the draft, so carry what the bar currently holds: a Save
  // from this modal must never reset the chosen voice or speed.
  prefs = shapePrefs(Object.assign({}, draft || prefs, { speech: Object.assign({}, state.speech) }));
  await writePrefs(prefs);
  draftFromPrefs();
  syncThemePref();
  applySpeech();
  updateForgetBtn();
  // say so when a key had to be repaired — the alternative is a user staring at
  // an unchanged-looking field wondering why the provider rejected it
  const note = dropped
    ? ` — dropped ${dropped} character${dropped === 1 ? '' : 's'} that cannot be in a key`
    : '';
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
  // only the keys go: provider / model / appearance / speech picks are separate
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

  // Speech lives in the bar under the nav bar, not in this modal: a voice or speed
  // change takes effect and is stored at once, so there is no Save step for it.
  els.voiceSelect.addEventListener('change', () => {
    state.speech.voice = els.voiceSelect.value;
    storeSpeech();
  });
  els.rateSelect.addEventListener('change', () => {
    state.speech.rate = parseFloat(els.rateSelect.value) || 1;
    storeSpeech();
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
  prefs = await loadPrefs();  // saved keys + provider + models + theme + speech
  state.provider = prefs.provider;
  state.speech = Object.assign({}, prefs.speech);
  applySpeech();              // paint the speech bar's voice and speed
  syncThemePref();            // paint the saved appearance
  renderProviderCards();      // model <option>s use the saved per-provider picks
  draftFromPrefs();
  applyDraftToInputs();       // the modal opens on exactly what is stored
  // The saved voice is in state before the voice list is built, and Chrome fills
  // that list asynchronously — so build it again here as well as at init.
  populateVoices();
  if (Object.keys(prefs.keys).length) {
    setStatus('Saved API keys restored — open Settings to review or erase them', 'success');
  }
}
