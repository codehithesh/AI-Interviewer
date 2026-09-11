// ============================================================
// API CALLS — the only network layer in the app
// ============================================================
// Everything that talks to a provider's HTTP API lives here: the request bodies,
// the per-provider auth headers, the retry-on-rejection fallbacks, and the
// parsing of the model's reply. Nothing about the UI or the scoring prompt is in
// this file — js/evaluation.js builds the prompt and reads the result.

'use strict';

// One chat completion against the chosen provider.
// prov = { name, label, key, model } as returned by activeProvider().
async function callChat(prov, model, messages) {
  const cfg = PROVIDER_MAP[prov.name];
  const headers = { 'content-type': 'application/json' };

  // sanitizeKey() upstream means the key is always sendable by the time it gets
  // here. If that ever stops being true, say why: a header value holding a code
  // point above Latin-1 makes fetch() throw before the request leaves the
  // browser, and the error it raises is about headers, not about the key.
  if (/[^\u0020-\u00FF]/.test(prov.key)) {
    throw new Error(
      `The ${cfg.label} API key contains a character that cannot be sent in a request. ` +
      'Re-paste the key in Settings.'
    );
  }

  // ---- Anthropic Messages API (different wire format) ----
  if (cfg.style === 'messages') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const conv = messages.filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const call = async (m) => {
      const resp = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          'authorization': 'Bearer ' + prov.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: m,
          max_tokens: 8192,
          ...(system ? { system } : {}),
          messages: conv,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        const err = new Error(`${cfg.label} ${resp.status}: ${txt.slice(0, 400)}`);
        err.status = resp.status; err.body = txt;
        throw err;
      }
      const data = await resp.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text: unwrapModelText(text) };
    };
    try { return await call(model); }
    catch (firstErr) {
      if (firstErr.status === 400 && cfg.fallback && cfg.fallback !== model) {
        try { return await call(cfg.fallback); } catch { /* keep original error */ }
      }
      throw firstErr;
    }
  }

  // ---- OpenAI-compatible chat completions ----
  const wantsJson = !!cfg.json && !(cfg.noJson ? cfg.noJson(model) : false);
  const wantsTemp = !!cfg.temp && !(cfg.noTemp ? cfg.noTemp(model) : false);
  const attempt = async (m, jsonFmt, temp) => {
    const body = {
      model: m,
      messages,
      ...(temp ? { temperature: 0.2 } : {}),
      ...(jsonFmt ? { response_format: { type: 'json_object' } } : {}),
    };
    const resp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { ...headers, 'authorization': 'Bearer ' + prov.key },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      const err = new Error(`${cfg.label} ${resp.status}: ${txt.slice(0, 400)}`);
      err.status = resp.status; err.body = txt;
      throw err;
    }
    const data = await resp.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message)
      ? (data.choices[0].message.content || '')
      : '';
    // An envelope that arrived as the CONTENT — what a relay hands back — is peeled
    // off here so both callers see the model's own text. See unwrapModelText().
    return { text: unwrapModelText(text) };
  };
  try {
    return await attempt(model, wantsJson, wantsTemp);
  } catch (firstErr) {
    let e = firstErr;
    // A param (temperature / response_format) this model rejects → retry bare.
    if (e.status === 400 && (wantsJson || wantsTemp)) {
      try { return await attempt(model, false, false); } catch (e2) { e = e2; }
    }
    // A model your account can't use → retry the provider's safe fallback, bare.
    if (e.status === 400 && cfg.fallback && cfg.fallback !== model) {
      try { return await attempt(cfg.fallback, false, false); } catch { /* keep original error */ }
    }
    throw e;
  }
}

// Models do not always obey "return only JSON": unwrap fences and prose.
function parseJsonLoose(text) {
  if (!text) throw new Error('empty model response');
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through */ }
  }
  throw new Error('model returned non-JSON output');
}

// ---------- the provider envelope ----------
// Sometimes the text that arrives is not what the model wrote but the PROVIDER'S OWN
// RESPONSE OBJECT, stringified: {"choices":[{"message":{"content":"…"}}]} for the
// OpenAI-compatible providers, or an Anthropic-style content array. A relay or an
// OpenAI-compatible shim in front of a provider can wrap the reply that way.
//
// This is unwrapped at the TRANSPORT layer, in callChat, and that placement is the
// point: it covers every provider at once and every caller for free. Each caller
// otherwise has to remember to unwrap, and the two that exist would do it
// differently — js/evaluation.js would find no `overallScore` and render an empty
// scorecard, js/interviewer.js would find no `question` and report a broken reply.
//
// The guard is deliberately narrow: an object is only treated as an envelope when it
// carries something only an envelope has (choices[0].message, or a bare message with
// content). A genuine reply object — {type,question,reason} — is left alone, and
// anything unrecognised is returned unchanged so no reply is ever emptied by a
// heuristic that guessed wrong.
function envelopeContent(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';

  const choice = Array.isArray(obj.choices) && obj.choices[0] && typeof obj.choices[0] === 'object'
    ? obj.choices[0] : null;
  if (choice) {
    if (choice.message && typeof choice.message === 'object') {
      const c = choice.message.content;
      if (typeof c === 'string' && c.trim()) return c;
    }
    if (typeof choice.text === 'string' && choice.text.trim()) return choice.text;
  }

  const msg = obj.message;
  if (msg && typeof msg === 'object' && typeof msg.content === 'string' && msg.content.trim()) {
    return msg.content;
  }

  return '';
}

// The model's text with any envelope peeled off it. Returns the input unchanged
// whenever it is not envelope-shaped, which is the common case.
function unwrapModelText(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw || raw.charAt(0) !== '{') return text || '';
  let obj = null;
  try { obj = JSON.parse(raw); } catch { return text || ''; }
  const inner = envelopeContent(obj);
  return inner || text || '';
}

// ============================================================
// Reporting a failed request in plain language (§14)
// ============================================================
// Every branch below names the provider, because "it failed" is not something the
// user can act on. The raw provider text is never the message: at most the status
// code trails a sentence, and the primary line always says what happened and what
// to do about it.
//
// This matters more here than in most apps, because the recovery path is real: the
// provider and the model are read live on every request, so switching to another
// provider or typing a current model ID in Settings takes effect on the very next
// attempt — no restart, no lost transcript.
function describeApiError(error, prov) {
  const label = (prov && prov.label) || 'the provider';
  const model = (prov && prov.model) || 'that model';
  const status = error && error.status;
  const body = String((error && error.body) || '').toLowerCase();
  const message = String((error && error.message) || '').toLowerCase();

  // fetch() rejects with a TypeError whenever the request never got an answer, and
  // a blocked cross-origin request is indistinguishable from a dead network at this
  // layer — Chrome says "Failed to fetch", Safari "Load failed". So both are told
  // together, and the CORS half says plainly that no proxy is added (§3, §14).
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/.test(message)) {
    return `Could not reach ${label}. If your connection is fine, ${label} may be blocking direct browser requests, and that would need a proxy — this app does not add one.`;
  }

  // A quota/credit refusal is an account problem, not a bad key: saying so stops the
  // user re-pasting a key that is perfectly valid. Providers use 402, or 429 with a
  // billing word in the body.
  const quota = status === 402
    || (status === 429 && /quota|insufficient|billing|credit|balance|exceeded/.test(body));
  if (quota) {
    return `${label} is out of credits or over quota for this account. That is a billing problem this page cannot fix — switch provider, or pick another model in Settings, and press Try again; the change applies at once.`;
  }
  if (status === 429) return `${label} is busy right now. Wait a moment, then press Try again.`;
  if (status === 401 || status === 403) {
    return `${label} rejected the API key. Check it in Settings — a revoked key, or a key belonging to another account, does this.`;
  }
  if (status === 404) {
    return `Your ${label} account has no model called "${model}". Open Settings and type a current model ID, then press Try again.`;
  }
  if (status === 400) {
    return `${label} would not accept "${model}" for this request. Open Settings, pick or type a current model ID, then press Try again.`;
  }
  if (status >= 500) {
    return `${label} had a server problem and could not answer. Press Try again in a moment. (HTTP ${status})`;
  }
  return `The ${label} request failed${status ? ` (HTTP ${status})` : ''}. Press Try again, or check Settings.`;
}
