// ============================================================
// EVALUATION — the single assessment produced when an interview ends
// ============================================================
// The interview is over the moment this runs, so this file has one job: turn the
// transcript into a scorecard, once, and put it in the transcript as the last item.
// There is no separate results screen — §11 is emphatic about that — and the
// card is rendered inline by the same screen the interview ran on.
//
// Three things about it are deliberate:
//
//   · It runs ONCE. `state.evaluation` is checked before the request, so a second
//     [END], a stray timer tick or a double-clicked [Try again] cannot buy a second
//     call. The only way it runs again is the user asking, which is what the button
//     on a FAILED evaluation is for: the transcript is still there, so a quota or
//     network failure costs nothing but the click.
//   · It is scored by the model but clamped by the client. A score of 130, or the
//     string "82/100", becomes an integer in 0–100; a missing field is omitted from
//     the card rather than rendered as `undefined`.
//   · It never locks the app. A failed evaluation is an error bubble with [Try
//     again] in it; export and [Start interview] stay available throughout.
//
// The prompt lives here rather than in js/interviewer.js because it is a different
// job with a different contract: the interviewer must never score the candidate
// (§10.1), while this is nothing but scoring.

'use strict';

// How much of the transcript is sent. Longer answers mean more evidence, but the
// whole session is not needed to judge it, and a prompt this large is paid for on
// every attempt — so the most recent turns are what is sent. The cap is on
// characters of the candidate's own contributions, which is what actually grows:
// code blocks and long answers.
const EVAL_TRANSCRIPT_CHARS = 12000;

// Per-turn cap, so one pasted file cannot be the whole prompt.
const EVAL_TURN_CHARS = 2500;

const EVALUATION_RULES = [
  'You are reviewing a finished job interview and writing the candidate a short, honest scorecard.',
  '',
  'How to judge',
  '- Score the candidate on the evidence in the transcript and nothing else. Do not invent experience, technologies or answers that are not there.',
  '- Weigh the substance of the answers: specificity, reasoning, relevant experience, and how well they handled follow-ups and pushback.',
  '- Judge the ROLE they were interviewing for where one is named. A strong answer for a junior role and a weak one for a senior role should not score the same.',
  '- The transcript includes a microphone tag on answers that were dictated. That is a note about how the answer arrived, not about its quality.',
  '- Be encouraging but not flattering. False praise is worse than useless to someone preparing for a real interview.',
  '',
  'What to write',
  '- "summary": a short paragraph of plain prose — two to four sentences, no headings, no lists, no markdown.',
  '- "strengths": up to four specific things the candidate actually did well, each one sentence.',
  '- "areasToImprove": up to four specific, actionable things, each one sentence. Name what was missing and what would have made it stronger.',
  '- If the candidate gave little or nothing to go on, say so in the summary and score accordingly rather than inventing detail.',
].join('\n');

const EVALUATION_FORMAT_RULES = [
  'REPLY FORMAT',
  'Reply with one JSON object and nothing else — no prose before or after it, no code fence:',
  '{"type":"final_evaluation","overallScore":82,"summary":"...","strengths":["..."],"areasToImprove":["..."]}',
  '- "overallScore" is an integer from 0 to 100.',
  '- "strengths" and "areasToImprove" are arrays of short strings. Omit either one entirely rather than padding it.',
].join('\n');

// The brief for the review, built from the interview configuration that was
// actually in force. Every field is optional and an absent one is simply not
// mentioned, so an unconfigured interview is still reviewed rather than compared
// against a blank job description.
function buildEvaluationPrompt(cfg) {
  const c = cfg || {};
  const brief = [];
  if (c.role) brief.push(`- The role being interviewed for: ${c.role}.`);
  if (c.interviewType) brief.push(`- The kind of interview: ${c.interviewType}.`);
  if (c.difficulty) brief.push(`- The difficulty it was pitched at: ${c.difficulty}.`);
  if (c.questions) brief.push(`- It was set to ask at most ${c.questions} question${c.questions === 1 ? '' : 's'}.`);
  if (c.prompt) {
    brief.push('- The person who set the interview up gave the interviewer these extra instructions. Hold the candidate to them:');
    brief.push(c.prompt);
  }

  const parts = [EVALUATION_RULES];
  if (brief.length) parts.push('THE INTERVIEW THAT WAS RUN\n' + brief.join('\n'));
  parts.push(EVALUATION_FORMAT_RULES);
  return parts.join('\n\n');
}

// One turn, as the reviewer reads it. A candidate answer is written out verbatim —
// a transcript that is trimmed is a transcript the score is wrong about — while the
// interviewer's own turns are kept short: they are the questions, and only the
// questions matter for judging the answers.
function transcriptTurnText(t) {
  const text = typeof t.text === 'string' ? t.text : '';
  const clipped = text.length > EVAL_TURN_CHARS ? text.slice(0, EVAL_TURN_CHARS) + ' […truncated]' : text;
  if (t.role === 'user') {
    const via = t.mode === 'voice' ? ' (answered by voice)' : '';
    return `CANDIDATE${via}:\n${clipped}`;
  }
  return `INTERVIEWER:\n${clipped}`;
}

// The whole transcript, oldest contributions first. Turns are dropped from the
// FRONT when the cap is reached, because how the interview ENDED is what is being
// judged — the opening greeting is the one part the reviewer does not need.
function buildEvaluationTranscript(transcript) {
  const turns = (transcript || []).filter((t) => t.kind !== 'error' && typeof t.text === 'string' && t.text.trim());
  const kept = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const block = transcriptTurnText(turns[i]);
    if (kept.length && total + block.length > EVAL_TRANSCRIPT_CHARS) break;
    kept.unshift(block);
    total += block.length;
  }
  return kept.join('\n\n');
}

// ============================================================
// Reading the result
// ============================================================
// A model asked for a score does not reliably send a score: 82 arrives as 82, "82",
// "82/100", 130 or null. None of those may reach the card as-is, so everything is
// coerced here and anything that cannot be coerced is dropped rather than rendered.

// A 0–100 integer, or null when the model did not give a usable number.
function clampScore(payload) {
  const raw = payload && payload.overallScore !== undefined ? payload.overallScore : (payload && payload.score);
  if (typeof raw === 'string') {
    const m = /-?\d+(?:\.\d+)?/.exec(raw);         // "82/100", "82%", " 82 " → 82
    if (!m) return null;
    return clampScore({ overallScore: Number(m[0]) });
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function textField(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function listField(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .slice(0, 6);                                   // a runaway list is not a scorecard
}

// The one shape the renderer is allowed to see.
function normalizeEvaluation(payload, provider, model) {
  const obj = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  return {
    score: clampScore(obj),
    summary: textField(obj.summary),
    strengths: listField(obj.strengths),
    areasToImprove: listField(obj.areasToImprove),
    provider: provider || '',
    model: model || '',
  };
}

// Nothing to show is not a result: an empty object would render an empty card that
// looks like a bug. It is reported as a failure instead, which is retryable.
function hasEvaluationContent(result) {
  return !!result && (result.score !== null || !!result.summary
    || result.strengths.length > 0 || result.areasToImprove.length > 0);
}

// ============================================================
// Rendering
// ============================================================
// The card is built with DOM calls rather than innerHTML, like every other
// transcript item: the text is model output, and the one place model output is
// allowed to become markup is js/markdown.js rendering an interviewer reply.
// Here it is a score, a paragraph and two lists, so nothing needs parsing at all.

function evaluationList(title, items) {
  if (!items.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'eval-section';
  const h = document.createElement('h4');
  h.textContent = title;
  const ul = document.createElement('ul');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  wrap.appendChild(h);
  wrap.appendChild(ul);
  return wrap;
}

function renderEvaluationCard(result) {
  const li = document.createElement('li');
  li.className = 'turn eval-turn';
  li.setAttribute('aria-label', 'Final evaluation');

  const card = document.createElement('div');
  card.className = 'card eval-card';

  const head = document.createElement('div');
  head.className = 'eval-head';
  const h = document.createElement('h2');
  h.textContent = 'Interview evaluation';
  head.appendChild(h);
  if (result.score !== null) {
    // Text, not decoration: the number is the score, and its label says so (§15).
    const score = document.createElement('span');
    score.className = 'eval-score';
    score.id = 'im-eval-score';
    score.setAttribute('role', 'img');
    score.setAttribute('aria-label', `Overall score: ${result.score} out of 100`);
    const n = document.createElement('strong');
    n.textContent = String(result.score);
    score.appendChild(n);
    score.appendChild(document.createTextNode('/100'));
    head.appendChild(score);
  }
  card.appendChild(head);

  if (result.summary) {
    const p = document.createElement('p');
    p.className = 'eval-summary';
    p.textContent = result.summary;
    card.appendChild(p);
  }
  const strengths = evaluationList('What went well', result.strengths);
  if (strengths) card.appendChild(strengths);
  const improve = evaluationList('What to work on', result.areasToImprove);
  if (improve) card.appendChild(improve);

  const footer = document.createElement('p');
  footer.className = 'dim eval-footer';
  footer.textContent = 'Scored by ' + (result.provider || 'the provider') + ' / ' + (result.model || 'the model')
    + ' from this transcript. It is one opinion, not a verdict.';
  card.appendChild(footer);

  li.appendChild(card);
  return li;
}

// The wait, in the transcript, where the answer will appear — rather than a toast
// that would clear itself while the request is still in the air. It is session
// state and not a turn, so it is never exported; it goes when the card replaces it.
function appendEvaluationLoader() {
  const li = document.createElement('li');
  li.className = 'turn eval-turn';
  const card = document.createElement('div');
  card.className = 'card eval-card eval-loading';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const h = document.createElement('h2');
  h.textContent = 'Interview evaluation';
  const p = document.createElement('p');
  p.className = 'dim';
  p.textContent = 'Scoring the interview…';
  card.appendChild(h);
  card.appendChild(p);
  li.appendChild(card);
  els.transcript.appendChild(li);
  scrollBottom(els.transcript);
  return li;
}

function dropEvaluationLoader(loader) {
  if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
}

// ============================================================
// Running it
// ============================================================

function evaluationFailed() {
  return !!(state.evaluation && state.evaluation.ok === false);
}

// The session token, read through js/interview.js rather than reached for directly.
// It is bumped by the two ways into a new session — startInterview() and
// resetSession() — and by nothing else, so comparing it before and after an await is
// what tells this module whether the interview the evaluation was run for is still
// the one on screen.
function currentSessionToken() {
  return typeof getInterviewSessionId === 'function' ? getInterviewSessionId() : -1;
}

// Exactly one evaluation per session, and exactly one retry of a failed one.
function evaluationInFlight() {
  return !!(state.evaluation && state.evaluation.__pending);
}

// The single network path for the review. It runs from endInterview(), and from the
// [Try again] button on a failed card — and nowhere else.
async function runEvaluation() {
  // Only a finished interview is evaluated, and only one request is in the air at
  // a time — the same guard every other request goes through, so the evaluation
  // cannot overlap a question that is still being fetched.
  if (state.view !== 'done' || state.busy || state.evaluation) return;

  const prov = activeProvider();
  if (!prov.key) {
    state.evaluation = { ok: false, error: `No ${prov.label} API key is set, so this interview was not scored.` };
    addErrorBubble(`${prov.label} has no API key, so there is no evaluation. Add one in Settings, then press Try again — the transcript is untouched.`, runEvaluation);
    return;
  }

  const transcript = buildEvaluationTranscript(state.transcript);
  if (!transcript.trim()) {
    state.evaluation = { ok: false, error: 'There was nothing in the transcript to score.' };
    addNotice('There was nothing in the transcript to score.');
    return;
  }

  const token = currentSessionToken();
  state.evaluation = { __pending: true };      // the once-only flag, set before the await
  state.busy = true;
  updateControls();

  const loader = appendEvaluationLoader();
  let reply;
  try {
    reply = await callChat(prov, prov.model, [
      { role: 'system', content: buildEvaluationPrompt(state.config) },
      { role: 'user', content: 'Here is the interview transcript.\n\n' + transcript + '\n\nScore it now.' },
    ]);
  } catch (err) {
    // The session may have been restarted while this was in the air. Then this
    // result belongs to an interview that is no longer on screen, and it is dropped
    // rather than rendered into the new one.
    if (token !== currentSessionToken()) return;
    finishEvaluation(loader, null, describeApiError(err, prov), prov);
    return;
  }
  if (token !== currentSessionToken()) return;

  let payload = null;
  let parseError = '';
  try {
    payload = parseJsonLoose(reply && reply.text);
  } catch {
    parseError = 'The evaluation came back in a format this app could not read, so there is no score to show.';
  }

  const result = parseError ? null : normalizeEvaluation(payload, prov.name, prov.model);
  finishEvaluation(loader, parseError ? null : result, parseError, prov);
}

// The one place that writes the outcome: a card, or an error bubble carrying the
// retry. Either way the flag is left holding the outcome, so nothing runs twice.
function finishEvaluation(loader, result, error, prov) {
  dropEvaluationLoader(loader);

  if (result && hasEvaluationContent(result)) {
    state.evaluation = { ok: true, provider: prov.name, model: prov.model, result };
    els.transcript.appendChild(renderEvaluationCard(result));
    scrollBottom(els.transcript);
    setStatus('Interview evaluated — you can export it or start a new interview', 'success');
  } else {
    const message = error || 'The evaluation came back empty, so there is no score to show.';
    state.evaluation = { ok: false, error: message };
    addErrorBubble(message + ' The transcript is untouched — press Try again to score it again.', runEvaluation);
    setStatus(message, 'warn');
  }

  state.busy = false;
  updateControls();
}

// ---------- wiring ----------
// Nothing to attach: the evaluation is started by the end of an interview
// (js/interview.js) and retried from the button inside its own error bubble. This
// exists so every module has the same shape and js/main.js can list it.
function initEvaluation() {}
