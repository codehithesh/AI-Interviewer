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
      return { text };
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
    return { text };
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
