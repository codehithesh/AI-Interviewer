// ============================================================
// PROVIDERS — BYOK evaluation backends
// ============================================================
// style 'chat'     = OpenAI-compatible /chat/completions (Bearer auth)
// style 'messages' = Anthropic Messages API (anthropic-version header)
// json / temp      = whether the API accepts response_format + temperature;
//                    callChat retries bare if a model rejects either.
// strictRoles      = the API VALIDATES the messages array (non-empty, alternating,
//                    starting on `user`, and/or ending on `user`). callChat repairs the
//                    transcript for these providers only — see roleSafeMessages() in
//                    js/api.js. Without it the opening turn is an empty conversation and
//                    the first recorded turn is the interviewer's own question.
// The wire format itself lives in js/api.js.
//
// Model IDs were checked against each provider's live documentation on 2026-09-11.
// They are only suggestions in a <datalist>, so a stale ID costs the user a retype
// rather than a dead end (Settings' model field is free text) — but they are worth
// re-checking before each release, because every provider retires models on its own
// schedule. OpenAI's o3-mini and o4-mini were removed from this list for exactly that
// reason: both shut down on 2026-10-23.

'use strict';

const PROVIDERS = [
  {
    id: 'openai', label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'gpt-5.6-terra',
    // The o-series and the gpt-5/gpt-6 reasoning families reject temperature.
    noTemp: (m) => /^(o[134]|gpt-[56])/.test(m),
    hint: 'Reasoning models fall back to gpt-5.6-terra automatically if your key rejects them.',
    ph: 'sk-...',
    models: [
      { v: 'gpt-6-astra', l: 'GPT-6 Astra (deepest reasoning)' },
      { v: 'gpt-5.6-sol', l: 'GPT-5.6 Sol (flagship)' },
      { v: 'gpt-5.6-terra', l: 'GPT-5.6 Terra (balanced)' },
      { v: 'gpt-4o', l: 'GPT-4o (fast, no reasoning)' },
    ],
  },
  {
    id: 'anthropic', label: 'Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    style: 'messages', json: false, temp: false, strictRoles: true,
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
    fallback: 'deepseek-flash',
    // deepseek-chat / deepseek-reasoner are retired names. Both current models support
    // response_format, so neither needs the `noJson` exemption the old reasoner did.
    hint: 'Both models think by default; temperature is accepted but ignored in thinking mode.',
    ph: 'sk-...',
    models: [
      { v: 'deepseek-flash', l: 'deepseek-flash (fast)' },
      { v: 'deepseek-v4-pro', l: 'deepseek-v4-pro (deep reasoning)' },
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
    id: 'grok', label: 'Grok',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'grok-4.6',
    hint: 'Key from console.x.ai. Grok places no order limit on the messages array.',
    ph: 'xai-...',
    models: [
      { v: 'grok-4.6', l: 'Grok 4.6 (deepest reasoning)' },
      { v: 'grok-4.5', l: 'Grok 4.5' },
      { v: 'grok-4.3', l: 'Grok 4.3 (fast, 1M context)' },
    ],
  },
  {
    id: 'qwen', label: 'Qwen',
    // Alibaba Model Studio's OpenAI-compatible endpoint. The region-specific domains
    // Alibaba now recommends embed a workspace ID (`{WorkspaceId}.ap-southeast-1…`)
    // that this app has no field for, so the international endpoint is used instead.
    // It demands more of the messages array than the others — see strictRoles.
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    style: 'chat', json: true, temp: true, strictRoles: true,
    fallback: 'qwen3.8-flash',
    hint: 'Alibaba Model Studio (Singapore). The key must come from the same region as the endpoint.',
    ph: 'sk-...',
    models: [
      { v: 'qwen3.8-max', l: 'Qwen3.8 Max (deep reasoning)' },
      { v: 'qwen3.7-plus', l: 'Qwen3.7 Plus (balanced)' },
      { v: 'qwen3.8-flash', l: 'Qwen3.8 Flash (fast)' },
    ],
  },
  {
    id: 'zai', label: 'Z.ai',
    endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'glm-5.3',
    hint: 'Z.ai (Zhipu GLM). Key from z.ai — GLM-5.3 always reasons and cannot be told not to.',
    ph: '...',
    models: [
      { v: 'glm-5.3', l: 'GLM-5.3 (flagship reasoning)' },
      { v: 'glm-5.2', l: 'GLM-5.2' },
      { v: 'glm-5.3-flash', l: 'GLM-5.3 Flash (fast)' },
    ],
  },
  {
    id: 'meta', label: 'Muse Spark',
    endpoint: 'https://api.meta.ai/v1/chat/completions',
    style: 'chat', json: true, temp: true,
    fallback: 'muse-spark-1.1',
    hint: 'Meta Model API. Key from dev.meta.ai — reasoning is always on. The Contributor model is cheaper but lets Meta train on your prompts.',
    ph: '...',
    models: [
      { v: 'muse-spark-1.3', l: 'Muse Spark 1.3 (deepest reasoning)' },
      { v: 'muse-spark-1.1', l: 'Muse Spark 1.1' },
      { v: 'muse-spark-1.3-contributor', l: 'Muse Spark 1.3 Contributor (cheaper, prompts used for training)' },
    ],
  },
];

const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

// ---------- structured output, and what to say when a model cannot do it ----------
// The interviewer's reply format and the evaluation's scorecard are both requested as
// JSON, and wherever the provider allows it js/api.js also enforces that with
// `response_format`. A provider whose reasoning models reject that parameter declares
// them with `noJson(model)`, and callChat then leaves it off. Such a model is asked for
// JSON in WORDS ONLY, and a reasoning model asked in words may well answer in prose.
//
// NO PROVIDER SHIPPED TODAY NEEDS THIS. Every model listed above accepts
// `response_format` — including the two DeepSeek models, where the retired
// `deepseek-reasoner` was the original reason this mechanism exists. It is kept because
// it is a real provider capability and the alternative is rediscovering it at runtime;
// a future model that rejects the parameter declares itself here and the rest of the
// app keeps working.
//
// What it means per feature, which is why these helpers exist:
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
