// ============================================================
// INTERVIEW SCREEN — Ready / Live / Done, and the answer → question loop
// ============================================================
// The screen is the whole app, and it has exactly three states. They are class and
// DOM toggles inside this one document — nothing about a state change is written
// to the URL, and there is no router and no second page.
//
//   Ready   the initial view, and where [Restart] returns to. A readiness card
//           instead of a transcript; the composer is inert.
//   Live    reached by pressing [Start interview] — and by nothing else. This is
//           the only thing that begins an interview, which also makes it the user
//           gesture the browser's autoplay policy requires before speech may start.
//   Done    the Live layout with the session finished: composer and [+] disabled,
//           the evaluation as the last transcript item, the rail's button becomes
//           [Restart]. Not a third screen.
//
// The loop is deliberately small, and state.busy is the single gate on it:
//
//   [Start interview] ─▶ requestInterviewerTurn() ─▶ greeting + question 1
//   answer ([>] / Enter / code) ─▶ pushHistory ─▶ requestInterviewerTurn() ─▶ question N
//
// Every path that can start a request goes through requestInterviewerTurn(), and
// the first thing it does is refuse if one is already in the air. That is what stops
// a double-clicked [>], a held Enter and the automatic follow-up request from ever
// issuing two concurrent calls (§8.3) — the guard is not repeated at the call sites.
//
// The model is asked for one turn at a time on purpose: the client counts questions
// and will enforce the cap (§10.4), rather than trusting the model to declare itself
// finished.
//
// The markup lives in js/interview-view.js; the prompt, the reply format and the
// history live in js/interviewer.js.

'use strict';

// Bumped by [Start interview] and by [Restart]. A reply that arrives after the
// session it belongs to has been ended or replaced is dropped instead of landing in
// the wrong interview — which is what makes it safe to leave [END] live while a
// request is still in the air.
let sessionId = 0;

// ============================================================
// Rendering
// ============================================================

// Which role wrote a turn decides how it renders, and for a model reply that is
// also the whole security boundary: markdown is only ever rendered through
// js/markdown.js, which escapes before it writes a single tag. A typed answer and an
// error are plain text.
function turnListItem(turn) {
  const li = document.createElement('li');
  li.className = 'turn';
  li.dataset.kind = turn.kind;
  li.dataset.role = turn.role;
  return li;
}

// Does this answer carry a code block? With the code editor inserting a fenced
// snippet into the composer rather than sending on its own, an answer is prose and
// code in one message — this is what tells the renderer to lay it out as markdown so
// the snippet becomes a real code block instead of a wall of backticks.
function hasCodeFence(text) {
  return /^ {0,3}(?:`{3,}|~{3,})/m.test(text || '');
}

// [Try again] on a failed turn. The candidate's answer is already in the history —
// only the request for the next question failed — so retrying asks again with the
// same context, which is exactly what makes "fix it in Settings and carry on" work
// after a quota refusal. The button re-checks the guard through
// requestInterviewerTurn(), so a double click cannot fire two requests.
function retryRow() {
  const row = document.createElement('div');
  row.className = 'bubble-actions';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn compact';
  btn.textContent = 'Try again';
  btn.title = 'Ask the interviewer again — your answers so far are kept';
  btn.addEventListener('click', () => {
    // A finished session keeps its transcript, so an old error turn can still be on
    // screen. Say why nothing happens rather than looking broken.
    if (state.view !== 'live') {
      setStatus('This interview has ended — press Restart to run another', 'warn');
      return;
    }
    requestInterviewerTurn();
  });
  row.appendChild(btn);
  return row;
}

function appendBubble(turn) {
  const li = turnListItem(turn);
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (turn.role === 'user' ? 'user' : 'ai')
    + (turn.kind === 'error' ? ' error' : '');

  const head = document.createElement('div');
  head.className = 'bubble-header';
  head.textContent = turn.role === 'user' ? 'You' : 'AI Interviewer';
  if (turn.kind === 'answer' && turn.mode === 'voice') {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = '· mic';
    head.appendChild(t);
  }
  bubble.appendChild(head);

  const body = document.createElement('div');
  body.className = 'bubble-body';
  if (turn.role === 'ai' && turn.kind === 'question' && typeof renderMarkdownInto === 'function') {
    renderMarkdownInto(body, turn.text);          // the model writes markdown
  } else if (turn.role === 'user' && hasCodeFence(turn.text) && typeof renderMarkdownInto === 'function') {
    renderMarkdownInto(body, turn.text);          // prose + a fenced snippet
  } else {
    body.textContent = turn.text;                 // textContent: never markup
  }
  bubble.appendChild(body);

  if (turn.retry) bubble.appendChild(retryRow());

  li.appendChild(bubble);
  els.transcript.appendChild(li);
  scrollBottom(els.transcript);
  return li;
}

// A turn is pushed onto the transcript before it is rendered, so the export sees
// every turn the screen shows and nothing else.
function addTurn(turn) {
  const full = Object.assign({ id: 't' + (state.transcript.length + 1), ts: new Date().toISOString() }, turn);
  state.transcript.push(full);
  if (full.role === 'user' && full.kind === 'answer') state.answers.push(full.text);
  appendBubble(full);
  updateControls();
  return full;
}

function clearTranscript() {
  els.transcript.textContent = '';
}

// ============================================================
// Two blocks of markup the screen owns: the readiness card and the notice
// ============================================================

// Ready is a readiness card, not an empty transcript: it restates what is about
// to happen, from the saved configuration, so the user can see they are about to
// be interviewed for the right role at the right difficulty — before spending a
// single API call. Built with DOM calls rather than innerHTML because the role and
// the seed prompt are free text the user typed.
function renderReadiness() {
  clearTranscript();
  const cfg = state.config;

  const li = document.createElement('li');
  li.className = 'turn readiness-turn';

  const card = document.createElement('div');
  card.className = 'readiness card';

  const h = document.createElement('h2');
  h.textContent = 'Ready when you are';
  card.appendChild(h);

  const p = document.createElement('p');
  p.className = 'readiness-lead';
  p.textContent = cfg.role
    ? `A ${cfg.difficulty} ${cfg.interviewType} interview for ${cfg.role}.`
    : `A ${cfg.difficulty} ${cfg.interviewType} interview.`;
  card.appendChild(p);

  const dl = document.createElement('dl');
  dl.className = 'readiness-list';
  const row = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  };
  row('Role', cfg.role || 'not set');
  row('Type', cfg.interviewType);
  row('Difficulty', cfg.difficulty);
  row('Duration', cfg.duration ? `${cfg.duration} minute${cfg.duration === 1 ? '' : 's'}` : 'no time limit');
  row('Questions', cfg.questions ? `up to ${cfg.questions}` : 'no question limit');
  card.appendChild(dl);

  if (cfg.prompt) {
    const seed = document.createElement('p');
    seed.className = 'readiness-seed';
    const strong = document.createElement('strong');
    strong.textContent = 'Seed prompt: ';
    seed.appendChild(strong);
    seed.appendChild(document.createTextNode(cfg.prompt));
    card.appendChild(seed);
  }

  const note = document.createElement('p');
  note.className = 'dim';
  note.textContent = 'The interviewer will greet you and ask one question at a time. '
    + 'Answer by voice or by typing. Press Start interview to begin.';
  card.appendChild(note);

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'btn primary';
  start.textContent = 'Start interview';
  start.addEventListener('click', startInterview);
  card.appendChild(start);

  li.appendChild(card);
  els.transcript.appendChild(li);
  updateControls();
}

// A short plain-language notice in the transcript, used where the spec asks for a
// notice instead of an API call or a crash. Never throws and never ends the run.
function addNotice(text) {
  const li = document.createElement('li');
  li.className = 'turn';
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = text;
  li.appendChild(div);
  els.transcript.appendChild(li);
  scrollBottom(els.transcript);
}

// ============================================================
// Timer
// ============================================================
// Counts DOWN from the configured duration and ends the interview at zero. With no
// duration configured it counts UP instead of blocking or showing negative time.
// The readout is text, and its title states the same thing in words, because the
// timer may not be communicated by digits alone (§15).

let timerHandle = null;

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function elapsedSeconds() {
  return state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0;
}

function remainingSeconds() {
  const limit = state.config.duration ? state.config.duration * 60 : null;
  return limit === null ? null : limit - elapsedSeconds();
}

function paintTimer() {
  const remaining = remainingSeconds();
  if (remaining === null) {
    const up = formatClock(elapsedSeconds());
    els.timer.textContent = up;
    els.timer.title = `No time limit — ${up} elapsed`;
    return;
  }
  const left = Math.max(0, remaining);
  els.timer.textContent = formatClock(left);
  const mins = Math.ceil(left / 60);
  els.timer.title = left <= 0
    ? 'Time is up'
    : `${mins} minute${mins === 1 ? '' : 's'} remaining`;
  els.timer.classList.toggle('low', left <= 60);
}

function startTimer() {
  stopTimer();
  paintTimer();
  timerHandle = setInterval(() => {
    paintTimer();
    const remaining = remainingSeconds();
    if (remaining !== null && remaining <= 0) endInterview('timer');
  }, 1000);
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

// ============================================================
// Screen state
// ============================================================

// The Ready and Done nudges that used to sit in a hint line above the composer are
// toasts now, and they are posted HERE rather than in updateControls(): that runs on
// every activity change, so a screen state that merely persisted would re-post its
// own message for as long as it lasted. A transition is what a click produces —
// [Restart] and [END] — so a transition is what these belong to. Boot sets 'ready'
// over the 'ready' state.js already holds, which the guard below makes a no-op: the
// readiness card explains itself, and a toast repeating it on load would be noise.
// The live activity state is not lost — the §8.3 status line carries it continuously.
function setView(next) {
  const changed = state.view !== next;
  state.view = next;
  els.view.dataset.state = next;
  updateControls();
  if (!changed) return;
  if (next === 'ready') setStatus('Ready — press Start interview');
  else if (next === 'done') setStatus('Interview finished — restart or export it');
}

// ============================================================
// Lifecycle
// ============================================================

// Fill state.config from the saved preferences. This is a snapshot: later Settings
// edits apply to the next interview, not this one.
function snapshotConfig() {
  const c = (prefs && prefs.interview) || {};
  state.config = {
    role: typeof c.role === 'string' ? c.role : '',
    interviewType: ['technical', 'behavioral', 'general'].indexOf(c.interviewType) >= 0 ? c.interviewType : 'general',
    difficulty: ['easy', 'medium', 'hard'].indexOf(c.difficulty) >= 0 ? c.difficulty : 'medium',
    duration: typeof c.duration === 'number' && c.duration > 0 ? c.duration : null,
    questions: typeof c.questions === 'number' && c.questions > 0 ? Math.floor(c.questions) : null,
    prompt: typeof c.prompt === 'string' ? c.prompt : '',
  };
}

function startInterview() {
  if (state.view !== 'ready' || state.busy) return;

  snapshotConfig();

  const prov = activeProvider();
  if (!prov.key) {
    // Plain language, points at Settings, and fires no request at all (§4.1).
    setStatus(`Add your ${prov.label} API key in Settings before starting the interview`, 'error');
    return;
  }

  sessionId += 1;
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.endedReason = null;
  state.transcript = [];
  state.answers = [];
  state.questionNumber = 0;
  state.evaluation = null;
  state.voiceTyped = false;
  state.busy = false;
  wipeHistory(state.config);   // §10.1 brief, built from the snapshot above

  clearTranscript();
  setView('live');
  startTimer();

  // The opening turn is a request like any other: the interviewer greets the
  // candidate and asks its first question in one message (§10.2), which is also
  // question number one. It runs from this user gesture, which is what lets the
  // greeting be spoken under the browser's autoplay policy (§8.1).
  requestInterviewerTurn();
}

// Ends the interview and runs the evaluation. Which of the three causes ended it is
// recorded in state.endedReason for the export.
function endInterview(reason) {
  if (state.view !== 'live') return;
  state.endedReason = reason || 'end';
  state.finishedAt = Date.now();
  stopTimer();

  // Speech is cancelled, recognition stopped and the camera released on every path
  // out of the interview: a finished session with a live camera is a light the user
  // did not ask to keep on. [Cam] itself stays available on the Done screen, so the
  // self-view can be switched straight back on.
  if (typeof stopTTS === 'function') stopTTS();
  if (typeof discardDictation === 'function') discardDictation();
  else if (typeof stopListening === 'function') stopListening();
  if (typeof stopCamera === 'function') stopCamera();
  // The code popup can outlive the interview — the countdown can expire while it is
  // open — and Done's composer takes no input, so it closes with its draft kept.
  if (typeof closeCodeEditor === 'function') closeCodeEditor();

  setView('done');
  paintTimer();

  const elapsed = formatClock(elapsedSeconds());
  addNotice(`Interview finished after ${elapsed} (${endReasonText(state.endedReason)}). `
    + (state.answers.length ? '' : 'No answers were given, so no evaluation was produced.'));
  // Phase 5 runs the evaluation here, once, when answers exist.
}

function endReasonText(reason) {
  return reason === 'timer' ? 'time was up'
    : reason === 'question_cap' ? 'the question limit was reached'
    : 'you ended it';
}

// [Restart] — clear the session and return to Ready WITHOUT touching the saved
// configuration. Every piece of session state is reset here and nowhere else.
function resetSession() {
  stopTimer();
  if (typeof stopTTS === 'function') stopTTS();
  if (typeof discardDictation === 'function') discardDictation();
  else if (typeof stopListening === 'function') stopListening();
  if (typeof stopCamera === 'function') stopCamera();
  // The popup and its draft go with the session: the composer is emptied just
  // below, and code kept from a finished interview would otherwise reappear under
  // the next one. closeCodeEditor() saves the draft first, so it is cleared after.
  if (typeof closeCodeEditor === 'function') closeCodeEditor();
  state.codeDraft = '';

  // A reply still in flight belongs to the session that is being thrown away.
  sessionId += 1;

  state.startedAt = null;
  state.finishedAt = null;
  state.endedReason = null;
  state.messages = [];
  state.transcript = [];
  state.answers = [];
  state.questionNumber = 0;
  state.evaluation = null;
  state.voiceTyped = false;
  state.listening = false;
  state.busy = false;

  els.imText.value = '';
  autoGrowComposer();
  els.timer.textContent = '00:00:00';
  els.timer.title = 'No interview running';
  els.timer.classList.remove('low');

  // Reload the configuration the card and the next interview will use, in case it
  // was edited while the finished session was on screen.
  snapshotConfig();
  setView('ready');
  renderReadiness();
}

function goToReady() {
  resetSession();
}

// ============================================================
// The answer → question loop
// ============================================================

// A failed turn is shown in the transcript, not thrown: the interview stays alive
// whatever the provider did. The turn carries [Try again] because the answer is
// already in the history — only the request failed.
function reportTurnError(message, opts) {
  const o = opts || {};
  addTurn({ role: 'ai', kind: 'error', text: message, retry: !!o.retry });
  setStatus(message, o.sticky ? 'error' : 'warn');
}

// The one network path. Asks the interviewer for its next turn — the opening
// greeting plus first question, or the question that follows the answer just sent.
async function requestInterviewerTurn() {
  // The single in-flight guard (§8.3). Every caller relies on this one check rather
  // than carrying its own, so the send button, Enter, [Try again] and the automatic
  // follow-up cannot issue two requests between them.
  if (state.view !== 'live' || state.busy) return;

  // The provider and the model are read LIVE, not from the snapshot, and that is
  // deliberate. A key that has run out of quota or a model ID the account rejects
  // has to be fixable in Settings mid-interview and take effect on the very next
  // request; a snapshot would leave the user stuck until they restarted and lost
  // the transcript. §4.1's snapshot governs the interviewer's BRIEF (role, type,
  // difficulty, duration, cap, seed) — the brief is frozen, the plumbing is not.
  const prov = activeProvider();
  if (!prov.key) {
    reportTurnError(
      `No ${prov.label} API key is set, so the interviewer cannot ask anything. Add one in Settings, then press Try again — nothing said so far is lost.`,
      { retry: true, sticky: true }
    );
    return;
  }

  // One voice at a time: an utterance in progress is cancelled before the next
  // request goes out (§8.1).
  if (typeof stopTTS === 'function') stopTTS();

  const token = sessionId;
  state.busy = true;
  updateControls();

  let reply = null;
  try {
    reply = await callChat(prov, prov.model, historyForRequest());
  } catch (err) {
    if (token !== sessionId || state.view !== 'live') return;
    reportTurnError(describeApiError(err, prov), { retry: true, sticky: true });
    return;
  } finally {
    // Only the session that made the request may clear the flag — otherwise a reply
    // to an abandoned interview would unlock the guard on the new one.
    if (token === sessionId) {
      state.busy = false;
      updateControls();
    }
  }

  // [END], the timer, the question cap or [Restart] may all have landed while the
  // request was in the air. The turn is dropped rather than shown in a dead session.
  if (token !== sessionId || state.view !== 'live') return;

  applyInterviewerReply(reply && reply.text);
  updateControls();
}

// Render, record and speak one interviewer turn.
function applyInterviewerReply(raw) {
  const parsed = parseInterviewerReply(raw);

  if (!parsed.question) {
    reportTurnError(parsed.error, { retry: true });
    return false;
  }

  // A reply that was not JSON but still reads as a question is used rather than
  // thrown away; say so, because it usually means the model ignored the format and
  // the user may want to switch models.
  if (parsed.repaired) {
    addNotice('The interviewer replied in the wrong format, so the text is shown exactly as it arrived. Switching model in Settings often fixes this.');
  }

  // The displayed text is what goes into history, so the model's next turn is
  // conditioned on what the candidate actually saw and heard.
  pushHistory('assistant', parsed.question);
  addTurn({ role: 'ai', kind: 'question', text: parsed.question });
  state.questionNumber += 1;

  speakInterviewer(parsed.question);

  // Phase 5 ends the interview here when state.config.questions is reached
  // (endedReason 'question_cap'); the client owns that count by design (§10.4).
  return true;
}

// Every interviewer message is spoken as it arrives unless auto-speak is off. The
// words are the markdown-aware reading path, so markers are not read out (§8.1).
function speakInterviewer(text) {
  if (state.speech.autoSpeak === false) return;
  if (typeof speakReply !== 'function' || typeof ttsAvailable !== 'function' || !ttsAvailable()) return;
  speakReply(text);
}

// Send what the composer holds. One message, whether it is prose, a fenced snippet
// from the code editor, or prose around one — the editor is a writing aid, so code
// arrives here already part of the answer.
function sendAnswer() {
  if (state.view !== 'live' || state.busy || state.speaking) return;

  const text = els.imText.value.trim();
  if (!text) return;                       // nothing to say — [>] is disabled anyway

  // Both of these are the spec's own list of what ends a recording and a reading
  // (§8.2, §8.1): sending an answer stops the mic and cancels the utterance.
  if (typeof discardDictation === 'function') discardDictation();
  else if (typeof stopListening === 'function') stopListening();
  if (typeof stopTTS === 'function') stopTTS();

  // Captured before the reset below: the tag on the bubble says where this answer
  // came from (§7.3).
  const mode = state.voiceTyped ? 'voice' : 'text';
  state.voiceTyped = false;

  pushHistory('user', text);
  addTurn({ role: 'user', kind: 'answer', mode, text });

  els.imText.value = '';
  autoGrowComposer();
  updateControls();

  requestInterviewerTurn();
}

// ---------- wiring ----------
function wireInterview() {
  els.btnSend.addEventListener('click', sendAnswer);
  els.btnPrimary.addEventListener('click', () => {
    if (state.view === 'ready') startInterview();
    else if (state.view === 'live') endInterview('end');
    else goToReady();
  });
}
