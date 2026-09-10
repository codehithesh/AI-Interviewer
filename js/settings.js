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
// The model control is a free-text <input list> backed by a <datalist>, NOT a
// <select>. Model IDs get renamed and retired, and a <select> turns a stale ID
// into a dead end — the user can only pick from a list this app shipped. A
// datalist still suggests the known IDs while leaving the field typeable, so the
// fix for a retired model is to type the current one.
function renderProviderCards() {
  els.providerList.innerHTML = PROVIDERS.map((p) => {
    const def = (draft && draft.models[p.id]) || p.def || p.models[0].v;
    const listId = 'models-' + p.id;
    const opts = p.models.map((m) =>
      `<option value="${escapeAttr(m.v)}">${escapeAttr(m.l)}</option>`
    ).join('');
    return `
      <div class="provider-card${p.id === state.provider ? ' active' : ''}" data-provider="${p.id}">
        <div class="pc-head">
          <span class="pc-radio"></span>
          <span class="pc-name">${escapeAttr(p.label)}</span>
          <span class="pc-models">${escapeAttr(p.models.map((m) => m.l).join(' · '))}</span>
        </div>
        <label for="key-${p.id}">API key</label>
        <input type="password" id="key-${p.id}" placeholder="${escapeAttr(p.ph || 'Paste your API key')}" autocomplete="off" spellcheck="false">
        <label for="model-${p.id}">Model</label>
        <input type="text" id="model-${p.id}" list="${listId}" value="${escapeAttr(def)}" spellcheck="false" autocomplete="off" placeholder="Type a current model ID">
        <datalist id="${listId}">${opts}</datalist>
        ${p.hint ? `<p class="hint">${escapeAttr(p.hint)}</p>` : ''}
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
// Speech is edited in the bar on the interview screen, not in this modal, so the
// voice, the speed and auto-speak take effect — and are stored — the moment they
// change. This paints the bar's controls from whatever is actually in force.
function applySpeech() {
  const s = (prefs && prefs.speech) || state.speech;
  state.speech = { voice: s.voice, rate: s.rate, autoSpeak: s.autoSpeak };
  els.voiceSelect.value = state.speech.voice;
  els.rateSelect.value = String(state.speech.rate);
  els.autoSpeak.checked = state.speech.autoSpeak !== false;
}

// Store the bar's settings at once — there is no Save step for them.
async function storeSpeech() {
  if (!prefs) prefs = blankPrefs();
  prefs = shapePrefs(Object.assign({}, prefs, { speech: Object.assign({}, state.speech) }));
  await writePrefs(prefs);
}

// ---------- interview configuration ----------
// Read the Interview section out of the modal into the draft, so a Save that
// happens while the fields hold something else does not silently revert them.
// A blank duration is the default length, not "no limit": the timer always counts
// down, so clearing the field falls back to DEFAULT_DURATION_MINUTES rather than
// turning the interview into an endless one. A blank question count is still null,
// which means "no question limit" — never 0, which would read as a limit of zero.
function readInterviewInputs() {
  const num = (id) => {
    const v = parseInt($(id).value, 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  return {
    role: $('iv-role').value.trim(),
    interviewType: $('iv-type').value,
    difficulty: $('iv-difficulty').value,
    duration: num('iv-duration') || DEFAULT_DURATION_MINUTES,
    questions: num('iv-questions'),
    prompt: $('iv-prompt').value.trim(),
  };
}

function paintInterviewInputs(cfg) {
  const c = cfg || defaultInterview();
  $('iv-role').value = c.role || '';
  $('iv-type').value = c.interviewType || 'general';
  $('iv-difficulty').value = c.difficulty || 'medium';
  $('iv-duration').value = c.duration || '';
  $('iv-questions').value = c.questions || '';
  $('iv-prompt').value = c.prompt || '';
}

// ---------- draft <-> stored preferences ----------
// the modal always opens on exactly what is stored
function draftFromPrefs() {
  draft = {
    keys: Object.assign({}, prefs.keys),
    provider: prefs.provider,
    models: Object.assign({}, prefs.models),
    theme: prefs.theme,
    interview: Object.assign({}, prefs.interview || defaultInterview()),
  };
}

function applyDraftToInputs() {
  if (!draft) return;
  for (const p of PROVIDERS) {
    providerInput(p.id).value = draft.keys[p.id] || '';
    // The model field accepts anything the user types, so whatever was saved goes
    // straight back in — a datalist mismatch must not blank the field.
    providerModel(p.id).value = draft.models[p.id] || p.def || p.models[0].v;
  }
  selectProvider(draft.provider);
  previewThemePref(draft.theme);
  paintInterviewInputs(draft.interview);
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
      draft.models[p.id] = providerModel(p.id).value.trim();
    }
    draft.provider = state.provider;
    draft.theme = uiThemePref;
    // The Interview fields are edited in this modal, so read them back out of it
    // rather than trusting the draft to have tracked every keystroke.
    draft.interview = readInterviewInputs();
  }
  // Speech is not part of the draft, so carry what the bar currently holds: a Save
  // from this modal must never reset the chosen voice, speed or auto-speak.
  prefs = shapePrefs(Object.assign({}, draft || prefs, { speech: Object.assign({}, state.speech) }));
  await writePrefs(prefs);
  draftFromPrefs();
  syncThemePref();
  applySpeech();
  updateForgetBtn();
  // The Ready card restates the saved configuration, so if the session is not
  // running it must be repainted with what was just saved.
  if (state.view === 'ready' && typeof renderReadiness === 'function') {
    snapshotConfig();
    renderReadiness();
  }
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
  // remembering a model choice is part of the draft too — the field is free text,
  // so this listens for 'input' as well as 'change' (picking from the datalist
  // fires 'change', typing fires 'input')
  const rememberModel = (e) => {
    if (draft && e.target.matches('input[id^="model-"]')) {
      draft.models[e.target.id.slice('model-'.length)] = e.target.value.trim();
    }
  };
  els.settingsModal.addEventListener('input', rememberModel);
  els.settingsModal.addEventListener('change', rememberModel);

  // Speech is edited in the bar on the interview screen, not in this modal: a
  // change takes effect and is stored at once, so there is no Save step for it.
  els.voiceSelect.addEventListener('change', () => {
    state.speech.voice = els.voiceSelect.value;
    storeSpeech();
  });
  els.rateSelect.addEventListener('change', () => {
    state.speech.rate = parseFloat(els.rateSelect.value) || 1;
    storeSpeech();
  });
  els.autoSpeak.addEventListener('change', () => {
    state.speech.autoSpeak = els.autoSpeak.checked;
    // Turning it off silences the message being read right now as well as the next
    // one — otherwise the switch would appear to do nothing until the next turn.
    if (!state.speech.autoSpeak && typeof stopTTS === 'function') stopTTS();
    else updateControls();
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
  prefs = await loadPrefs();  // keys + provider + models + theme + speech + interview
  state.provider = prefs.provider;
  state.speech = Object.assign({}, prefs.speech);
  applySpeech();              // paint the speech bar's voice, speed and auto-speak
  syncThemePref();            // paint the saved appearance
  renderProviderCards();      // the model fields use the saved per-provider picks
  draftFromPrefs();
  applyDraftToInputs();       // the modal opens on exactly what is stored
  // The saved voice is in state before the voice list is built, and Chrome fills
  // that list asynchronously — so build it again here as well as at init.
  populateVoices();
  if (Object.keys(prefs.keys).length) {
    setStatus('Saved API keys restored — open Settings to review or erase them', 'success');
  }
}
