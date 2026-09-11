// ============================================================
// API CALLS — the only network layer in the app
// ============================================================
// Everything that talks to a provider's HTTP API lives here: the request bodies,
// the per-provider auth headers, the retry-on-rejection fallbacks, and the
// parsing of the model's reply. Nothing about the UI or the scoring prompt is in
// this file — js/evaluation.js builds the prompt and reads the result.

'use strict';

// ============================================================
// "It thought and said nothing" — the empty answer
// ============================================================
// A reasoning model can spend its whole reply on private reasoning and then stop with
// an EMPTY `content`. This is a real capture, HTTP 200, deepseek-flash:
//
//   {"message":{"role":"assistant","content":"",
//               "reasoning_content":"The candidate is being uncooperative… I already
//                asked a SQL question twice… Let me ask a different, concrete SQL
//                question… Keep it brief, spoken."},
//    "finish_reason":"stop",
//    "usage":{"completion_tokens":159,
//             "completion_tokens_details":{"reasoning_tokens":159}}}
//
// Everything the model produced is in `reasoning_content`; `content` — the only field
// this app reads — is "". Note what this is NOT: not a quota problem, not a bad key,
// not a network failure, and not truncation. `finish_reason` is "stop" and the reply
// is complete, just empty of anything the candidate could hear. The model planned the
// question and never wrote it down.
//
// The reasoning text is DISCARDED and never shown, spoken or logged: the interviewer
// is instructed never to reveal its reasoning, and a private planning note is not
// something to read aloud as the next interview question. Only its PRESENCE is
// recorded, as `reasoningOnly`, so a caller can say what went wrong without quoting it.
//
// The empty answer is handled in two steps, and the order matters:
//
//  · RETRY ONCE WITH A NUDGE. Cheap, invisible when it works, and it frequently does:
//    the model is asked again with an explicit instruction that this reply must contain
//    the answer itself, which is precisely the step it skipped.
//  · THEN REPORT IT AS WHAT IT IS. If the retry is empty too, the turn is a genuine
//    failure, and the callers say so in those terms (emptyAnswerHint in
//    js/providers.js) instead of as a vague empty reply.
//
// The nudge goes into the EXISTING system message rather than into a new one, so every
// provider sees the arrangement it already accepted. A second system message, or a
// second consecutive user turn, is rejected by some providers, and Anthropic's Messages
// API requires the roles to alternate.
const ANSWER_NUDGE = 'You must write your answer in this reply. Do not use the whole reply for private reasoning: any reasoning has to be followed by the answer itself, written out in the form asked for above.';

function nudgedSystemText(system) {
  const base = typeof system === 'string' ? system.trim() : '';
  return base ? base + '\n\n' + ANSWER_NUDGE : ANSWER_NUDGE;
}

// The messages for a nudged retry, with the instruction added to the system turn. A
// copy is returned, so the caller's history — and the transcript on screen — is
// untouched by a retry the user never sees.
function withAnswerNudge(messages) {
  const out = (messages || []).map((m) => ({ ...m }));
  const sys = out.filter((m) => m.role === 'system')[0];
  if (sys) sys.content = nudgedSystemText(sys.content);
  // No system turn to extend (a bare completion call): the nudge leads as a user turn,
  // which is valid for every provider here.
  else out.unshift({ role: 'user', content: ANSWER_NUDGE });
  return out;
}

// Call once; if the model came back with no text at all, call once more with the nudge.
// `call(nudge)` returns { text, reasoningOnly }. Both-empty is reported rather than
// thrown: it is a model failure the caller describes in words, not an exception.
async function answerOrRetry(call) {
  const first = await call(false);
  if (first.text.trim()) return first;
  const second = await call(true);
  if (second.text.trim()) return second;
  // Keep whichever attempt saw private reasoning, so the caller can name the real cause.
  return { text: '', reasoningOnly: !!(first.reasoningOnly || second.reasoningOnly) };
}

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
    const call = async (m, nudge) => {
      // The nudge joins the system prompt here, for the reason given above.
      const sys = nudge ? nudgedSystemText(system) : system;
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
          ...(sys ? { system: sys } : {}),
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
      const blocks = data.content || [];
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return {
        text: unwrapModelText(text),
        // A thinking block is dropped by the filter above; this records that it was the
        // whole reply, without keeping or returning any of it. See the note above.
        reasoningOnly: !text.trim()
          && blocks.some((b) => b && (b.type === 'thinking' || b.type === 'redacted_thinking')),
      };
    };
    try { return await answerOrRetry((nudge) => call(model, nudge)); }
    catch (firstErr) {
      if (firstErr.status === 400 && cfg.fallback && cfg.fallback !== model) {
        try { return await answerOrRetry((nudge) => call(cfg.fallback, nudge)); } catch { /* keep original error */ }
      }
      throw firstErr;
    }
  }

  // ---- OpenAI-compatible chat completions ----
  const wantsJson = !!cfg.json && !(cfg.noJson ? cfg.noJson(model) : false);
  const wantsTemp = !!cfg.temp && !(cfg.noTemp ? cfg.noTemp(model) : false);
  const attempt = async (m, jsonFmt, temp, nudge) => {
    const body = {
      model: m,
      messages: nudge ? withAnswerNudge(messages) : messages,
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
    const message = (data.choices && data.choices[0] && data.choices[0].message) || null;
    const text = (message && typeof message.content === 'string') ? message.content : '';
    // An envelope that arrived as the CONTENT — what a relay hands back — is peeled
    // off here so both callers see the model's own text. See unwrapModelText().
    return {
      text: unwrapModelText(text),
      // `content` empty while `reasoning_content` is not is the model's "thinking out
      // loud then losing its nerve" case. The reasoning is read for this one boolean
      // and then dropped — it is never returned, shown or spoken. See the note above.
      reasoningOnly: !text.trim() && !!(message && typeof message.reasoning_content === 'string'
        && message.reasoning_content.trim()),
    };
  };
  // Every path that can succeed goes through here, so a model that answers with an
  // empty content is nudged and retried whatever route the request took.
  const answered = (m, jsonFmt, temp) => answerOrRetry((nudge) => attempt(m, jsonFmt, temp, nudge));
  try {
    return await answered(model, wantsJson, wantsTemp);
  } catch (firstErr) {
    let e = firstErr;
    // A param (temperature / response_format) this model rejects → retry bare.
    if (e.status === 400 && (wantsJson || wantsTemp)) {
      try { return await answered(model, false, false); } catch (e2) { e = e2; }
    }
    // A model your account can't use → retry the provider's safe fallback, bare.
    if (e.status === 400 && cfg.fallback && cfg.fallback !== model) {
      try { return await answered(cfg.fallback, false, false); } catch { /* keep original error */ }
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
