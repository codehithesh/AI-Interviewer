// ============================================================
// PROVIDERS — BYOK evaluation backends
// ============================================================
// style 'chat'     = OpenAI-compatible /chat/completions (Bearer auth)
// style 'messages' = Anthropic Messages API (anthropic-version header)
// json / temp      = whether the API accepts response_format + temperature;
//                    callChat retries bare if a model rejects either.
// The wire format itself lives in js/api.js.

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

// ---------- the provider inputs rendered in Settings ----------
function providerInput(id) { return document.getElementById('key-' + id); }
function providerModel(id) { return document.getElementById('model-' + id); }

function modelOptions(p, selected) {
  const def = selected || p.def || p.models[0].v;
  return p.models.map((m) =>
    `<option value="${m.v}"${m.v === def ? ' selected' : ''}>${m.l}</option>`
  ).join('');
}

// The provider + key + model currently selected in the Settings modal.
function activeProvider() {
  const cfg = PROVIDER_MAP[state.provider];
  return {
    name: cfg.id,
    label: cfg.label,
    // sanitized on the way out: this object is the only thing that becomes an
    // Authorization header, so cleaning here covers every path into the field —
    // a paste, a key restored from storage, or a hand-edited entry
    key: sanitizeKey(providerInput(cfg.id).value).key,
    model: providerModel(cfg.id).value,
  };
}
