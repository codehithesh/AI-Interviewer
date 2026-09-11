// ============================================================
// SAVE STORE — preferences in localStorage
// ============================================================
// The settings modal edits a draft (see js/settings.js); nothing from that modal
// reaches storage until you press Save, which remembers the API keys, the chosen
// provider, the chosen model per provider, the light/dark appearance choice and
// whether the interviewer's replies are masked in the chat.
// The voice and speed in the speech bar are the exception — they sit outside the
// modal, so they are written the moment they change. “Forget saved keys” erases
// the keys alone and leaves those preferences standing.
//
// Keys are not encrypted on purpose: a stored encryption key would live in the
// same place as the thing it protects, so it would protect against nothing extra.
//
// The one thing worth knowing: localStorage is scoped to the origin, and a GitHub
// Pages site is served from a shared <user>.github.io origin, so another project
// published under the same account could read what this one writes. “Forget saved
// keys” is the eraser. Nothing the app renders reaches the DOM as HTML — model
// replies are set with textContent — so a hostile page cannot be used to script
// the key back out through this app.

'use strict';

const STORE = {
  keys: 'rlApiKeys',
  provider: 'rlProvider',
  models: 'rlModels',
  theme: 'rlTheme',
  speech: 'rlSpeech',
  interview: 'rlInterview',
  maskAi: 'rlMaskAi',
};

const THEMES = ['system', 'light', 'dark'];
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const INTERVIEW_TYPES = ['technical', 'behavioral', 'general'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// A hand-edited or half-written entry must not take the other preferences down
// with it, so each value is parsed on its own.
function readJson(name) {
  try { return JSON.parse(localStorage.getItem(name) || 'null'); } catch { return null; }
}

// How long an interview runs when nothing else is configured. A duration is always
// in force, so the header timer always counts DOWN and a session can never run
// unattended — leaving it empty means this, not "unlimited" (js/interview.js).
const DEFAULT_DURATION_MINUTES = 60;

function defaultInterview() {
  return { role: '', interviewType: 'general', difficulty: 'medium', duration: DEFAULT_DURATION_MINUTES, questions: null, prompt: '' };
}

function blankPrefs() {
  return {
    keys: {}, provider: state.provider, models: {}, theme: 'system',
    speech: { voice: '', rate: 1, autoSpeak: true },
    interview: defaultInterview(),
    maskAi: false,
  };
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
      if (typeof m === 'string') p.models[prov.id] = m;
    }
  }
  if (THEMES.indexOf(raw.theme) >= 0) p.theme = raw.theme;
  // A display choice rather than part of the interview brief: masking the
  // interviewer's replies on screen. Anything that is not a real boolean (a
  // hand-edited storage entry, an older build) leaves it off.
  if (typeof raw.maskAi === 'boolean') p.maskAi = raw.maskAi;
  if (raw.interview && typeof raw.interview === 'object') {
    const i = raw.interview;
    if (typeof i.role === 'string') p.interview.role = i.role;
    if (INTERVIEW_TYPES.indexOf(i.interviewType) >= 0) p.interview.interviewType = i.interviewType;
    if (DIFFICULTIES.indexOf(i.difficulty) >= 0) p.interview.difficulty = i.difficulty;
    // A missing or unusable duration falls back to the default length rather than
    // to "no limit": the timer is a countdown, so it always needs a limit to count
    // from, and an unset field must not turn an interview into an endless one.
    const d = Number(i.duration);
    p.interview.duration = Number.isFinite(d) && d > 0 ? Math.floor(d) : DEFAULT_DURATION_MINUTES;
    const q = Number(i.questions);
    if (Number.isFinite(q) && q > 0) p.interview.questions = Math.floor(q);
    if (typeof i.prompt === 'string') p.interview.prompt = i.prompt;
  }
  if (raw.speech && typeof raw.speech === 'object') {
    if (typeof raw.speech.voice === 'string') p.speech.voice = raw.speech.voice;
    const r = Number(raw.speech.rate);
    if (RATES.indexOf(r) >= 0) p.speech.rate = r;
    if (typeof raw.speech.autoSpeak === 'boolean') p.speech.autoSpeak = raw.speech.autoSpeak;
  }
  return p;
}

async function loadPrefs() {
  let raw = {};
  try {
    raw = {
      keys: readJson(STORE.keys),
      provider: localStorage.getItem(STORE.provider) || undefined,
      models: readJson(STORE.models),
      theme: localStorage.getItem(STORE.theme) || undefined,
      speech: readJson(STORE.speech),
      interview: readJson(STORE.interview),
      maskAi: readJson(STORE.maskAi),
    };
  } catch { raw = {}; }
  return shapePrefs({
    keys: raw.keys,
    provider: raw.provider,
    models: raw.models,
    theme: raw.theme,
    speech: raw.speech,
    interview: raw.interview,
    maskAi: raw.maskAi,
  });
}

async function writePrefs(p) {
  const keys = Object.keys(p.keys).length ? p.keys : null;
  const models = Object.keys(p.models).length ? p.models : null;
  try {
    localStorage.setItem(STORE.provider, p.provider);
    localStorage.setItem(STORE.theme, p.theme);
    localStorage.setItem(STORE.maskAi, JSON.stringify(!!p.maskAi));
    localStorage.setItem(STORE.speech, JSON.stringify(p.speech));
    localStorage.setItem(STORE.interview, JSON.stringify(p.interview));
    if (models) localStorage.setItem(STORE.models, JSON.stringify(models));
    else localStorage.removeItem(STORE.models);
    if (keys) localStorage.setItem(STORE.keys, JSON.stringify(keys));
    else localStorage.removeItem(STORE.keys); // emptied → gone for good
  } catch { /* storage unavailable — stay in-memory only */ }
}

// Erase the saved keys from wherever they live.
async function eraseSavedKeys() {
  try { localStorage.removeItem(STORE.keys); } catch { /* ignore */ }
}
