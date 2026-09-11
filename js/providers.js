// ============================================================
// PROVIDERS — BYOK evaluation backends
// ============================================================
// style 'chat'     = OpenAI-compatible /chat/completions (Bearer auth)
// style 'messages' = Anthropic Messages API (anthropic-version header)
// json / temp      = whether the API accepts response_format + temperature;
//                    callChat retries bare if a model rejects either.
// The wire format itself lives in js/api.js.
//
// TODO — unverified model IDs. The Anthropic, Gemini and Moonshot `models` lists
// below have NOT been checked against each provider's live documentation and must
// not be treated as correct. They are only suggestions in a <datalist>, so a stale
// ID costs the user a retype rather than a dead end (Settings' model field is
// free text) — but these entries still need verifying before release.

'use strict';

const PROVIDERS = [
  {
    id: 'openai', label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'gpt-4o',
    noTemp: (m) => /^o[134]/.test(m),
    hint: 'Reasoning models fall back to gpt-4o automatically if your key rejects them.',
    ph: 'sk-...',
    models: [
      { v: 'o3-mini', l: 'o3-mini (reasoning)' },
      { v: 'o4-mini', l: 'o4-mini (reasoning)' },
      { v: 'gpt-4o', l: 'gpt-4o (fast)' },
    ],
  },
  {
    id: 'anthropic', label: 'Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    style: 'messages', json: false, temp: false,
    fallback: 'claude-sonnet-5',
    def: 'claude-sonnet-5',
    hint: 'Key from console.anthropic.com — JSON is requested inside the prompt.',
    ph: 'sk-ant-...',
    models: [
      { v: 'claude-fable-5-1', l: 'Fable 5.1 — deepest reasoning' },
      { v: 'claude-opus-5', l: 'Opus 5 — strongest overall' },
      { v: 'claude-sonnet-5', l: 'Sonnet 5 — speed + intelligence' },
      { v: 'claude-haiku-4-5-20251001', l: 'Haiku 4.5 — fastest' },
    ],
  },
  {
    id: 'google', label: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    style: 'chat', json: true, temp: false,
    fallback: 'gemini-2.5-flash',
    hint: 'API key from Google AI Studio (aistudio.google.com/apikey).',
    ph: 'AIza...',
    models: [
      { v: 'gemini-3.8-flash', l: 'Gemini 3.8 Flash' },
      { v: 'gemini-3.1-pro', l: 'Gemini 3.1 Pro' },
      { v: 'gemini-3-flash', l: 'Gemini 3 Flash' },
      { v: 'gemini-2.5-flash', l: 'Gemini 2.5 Flash' },
    ],
  },
  {
    id: 'deepseek', label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'deepseek-chat',
    noTemp: (m) => m === 'deepseek-reasoner',
    noJson: (m) => m === 'deepseek-reasoner',
    hint: 'OpenAI-compatible reasoning API. Reasoner falls back to deepseek-chat.',
    ph: 'sk-...',
    models: [
      { v: 'deepseek-reasoner', l: 'deepseek-reasoner (R1)' },
      { v: 'deepseek-chat', l: 'deepseek-chat (V3)' },
    ],
  },
  {
    id: 'moonshot', label: 'Kimi',
    endpoint: 'https://api.moonshot.ai/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'kimi-k2.6',
    noTemp: (m) => m === 'kimi-k3',
    hint: 'International endpoint (api.moonshot.ai).',
    ph: 'sk-...',
    models: [
      { v: 'kimi-k2.6', l: 'Kimi K2.6 (reasoning)' },
      { v: 'kimi-k3', l: 'Kimi K3 (1M context)' },
    ],
  },
  {
    id: 'mistral', label: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'mistral-small-latest',
    hint: 'Key from console.mistral.ai.',
    ph: '...',
    models: [
      { v: 'mistral-large-latest', l: 'Mistral Large' },
      { v: 'mistral-small-latest', l: 'Mistral Small (fast)' },
    ],
  },
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

// ---------- structured output, and what to say when a model cannot do it ----------
// The interviewer's reply format and the evaluation's scorecard are both requested as
// JSON, and for most models js/api.js also enforces it with `response_format`. A few
// reasoning models reject that parameter outright — deepseek-reasoner is the one this
// app ships — so `noJson(model)` marks them and callChat leaves it off. Such a model
// is then asked for JSON in WORDS ONLY, and a reasoning model asked in words may well
// answer in prose.
//
// What that means per feature, which is why this helper exists:
//   · The chat turn survives prose — a sentence is a perfectly good question, and
//     js/interviewer.js reads it as one. Nothing to report.
//   · The evaluation does NOT: a scorecard needs an object, and prose cannot be
//     coerced into one. That failure has to name the model and the way out, or the
//     user is left with "a format this app could not read" and no next step.
//
// So a provider that runs entirely on models like this is a dead end for scoring, and
// the message says so and points at a model that works instead of leaving the user to
// guess. Detection is by the same `noJson` predicate the request itself uses, so the
// advice can never disagree with what was actually sent.
function modelNeedsJsonInWords(providerId, model) {
  const cfg = PROVIDER_MAP[providerId];
  if (!cfg || !cfg.json || !cfg.noJson) return false;
  return !!cfg.noJson(model);
}

// A model that can be sent `response_format`, for a provider that has one. Prefers the
// provider's declared fallback (already vetted as a safe, generally-available model)
// and otherwise takes the first suggestion that is not itself words-only.
function jsonCapableModel(providerId, model) {
  const cfg = PROVIDER_MAP[providerId];
  if (!cfg || !cfg.json) return '';
  const wordsOnly = (m) => (cfg.noJson ? !!cfg.noJson(m) : false);
  if (cfg.fallback && !wordsOnly(cfg.fallback)) return cfg.fallback;
  const found = (cfg.models || []).filter((m) => !wordsOnly(m.v))[0];
  return found ? found.v : '';
}

// The sentence that turns an unreadable structured reply into a next step, naming the
// model the user is on and a model to switch to. Returns '' when the model was not
// the problem, so callers can keep their own wording in that case.
//
// `what` is the WHOLE clause describing what was lost, because only the caller knows
// which feature lost it: the evaluation lost a scorecard, the interviewer lost a
// question. It is interpolated verbatim — a fixed tail here would say it twice, which
// is exactly the bug this signature exists to prevent (the caller's "the next question
// could not be read" once came out as "…could not be read could not be read").
//
// It deliberately stops short of "press Try again": the callers append their own
// retry line, and this message already ends on the switch that makes a retry
// worthwhile.
function structuredReplyHint(providerId, label, model, what) {
  if (!modelNeedsJsonInWords(providerId, model)) return '';
  const alternative = jsonCapableModel(providerId, model);
  return `"${model}" cannot be asked for JSON output, so it answered freely, and ${what || 'the reply could not be read'}. `
    + `Open Settings and pick ${alternative ? `"${alternative}"` : 'a model that supports JSON output'}`
    + ` for ${label || 'this provider'} to fix that.`;
}

// The sibling of structuredReplyHint for a different cause: the model reasoned and then
// wrote nothing at all. `content` was empty while `reasoning_content` was not — a
// reasoning model that planned the answer privately and never produced it. See the
// note at the top of js/api.js for the real response this comes from.
//
// This is worth naming precisely, because the failure looks like the app's fault: the
// turn vanishes with no question on screen, and the honest-looking guesses (bad key,
// no credit, dead network) are all wrong. Two facts fix that, and both are in the
// message — the model is what failed, and the app has ALREADY retried it once with an
// explicit instruction to write the answer, so the user is not being told to do
// something the app skipped doing itself.
//
// `what` is interpolated verbatim, exactly as in structuredReplyHint, because only the
// caller knows what was lost.
//
// The model's reasoning is deliberately not quoted, summarised or hinted at: it is
// private by design (INTERVIEWER_RULES forbids revealing it), and it is discarded at
// the transport before it ever reaches here.
function emptyAnswerHint(label, model, what) {
  return `"${model}" spent its whole reply on private reasoning and never wrote an answer, `
    + `so ${what || 'there was nothing to show'}. This app asked it a second time and got the same empty reply. `
    + `That is the model rather than your key or this page — press Try again, or pick a model that answers `
    + `directly under ${label || 'this provider'} in Settings`;
}

// ---------- the provider inputs rendered in Settings ----------
function providerInput(id) { return document.getElementById('key-' + id); }
function providerModel(id) { return document.getElementById('model-' + id); }

// The provider + key + model currently selected in the Settings modal.
//
// This reads the fields LIVE on purpose, so it is called again for every request
// rather than cached at [Start interview]. A key that has run out of quota, or a
// model ID the account rejects, has to be fixable in Settings mid-interview and take
// effect on the very next attempt — see requestInterviewerTurn() and
// describeApiError(). The §12 config snapshot covers the interviewer's brief, not
// the plumbing. A consequence worth knowing: clicking a provider card, or editing a
// model field, affects the running interview immediately, before Save.
//
// The fields are read defensively: the chat is wired before the saved settings
// have loaded, so a message sent inside that window must report a missing key
// rather than throw on a provider card that does not exist yet.
function activeProvider() {
  const cfg = PROVIDER_MAP[state.provider];
  const keyEl = providerInput(cfg.id);
  const modelEl = providerModel(cfg.id);
  return {
    name: cfg.id,
    label: cfg.label,
    // sanitized on the way out: this object is the only thing that becomes an
    // Authorization header, so cleaning here covers every path into the field —
    // a paste, a key restored from storage, or a hand-edited entry
    key: keyEl ? sanitizeKey(keyEl.value).key : '',
    model: (modelEl && modelEl.value) || cfg.def || cfg.models[0].v,
  };
}
