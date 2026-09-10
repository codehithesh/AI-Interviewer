// ============================================================
// INTERVIEW SCREEN — Ready / Live / Done, and the session lifecycle
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
// Session state is torn down in exactly one place — resetSession() — so [Restart]
// cannot leave a leftover transcript, timer, camera stream or utterance behind.
// The markup lives in js/interview-view.js.

'use strict';

// ============================================================
// Rendering
// ============================================================

// Which role wrote a turn decides how it renders, and for a model reply that is
// also the whole security boundary: 'markdown' is only ever passed for text the
// model wrote, and js/markdown.js escapes before it writes a single tag. A typed
// answer, a code attachment and an error are all plain text.
function turnListItem(turn) {
  const li = document.createElement('li');
  li.className = 'turn';
  li.dataset.kind = turn.kind;
  li.dataset.role = turn.role;
  return li;
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
  if (turn.kind === 'code') {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = '· code';
    head.appendChild(t);
  }
  bubble.appendChild(head);

  const body = document.createElement('div');
  body.className = 'bubble-body';
  if (turn.kind === 'code') {
    const pre = document.createElement('pre');
    pre.className = 'code-block';
    const code = document.createElement('code');
    code.textContent = turn.text;   // textContent: code is never parsed as markup
    pre.appendChild(code);
    body.appendChild(pre);
  } else if (turn.role === 'ai' && turn.kind === 'question' && typeof renderMarkdownInto === 'function') {
    body.classList.add('md');
    renderMarkdownInto(body, turn.text);
  } else {
    body.textContent = turn.text;
  }
  bubble.appendChild(body);

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

function setView(next) {
  state.view = next;
  els.view.dataset.state = next;
  updateControls();
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
    // Plain language, points at Settings, and fires no request at all.
    setStatus(`Add your ${prov.label} API key in Settings before starting`, 'error');
    setApiError(`Enter your ${prov.label} API key to start the interview`);
    return;
  }

  state.startedAt = Date.now();
  state.finishedAt = null;
  state.endedReason = null;
  state.messages = [];
  state.transcript = [];
  state.answers = [];
  state.questionNumber = 0;
  state.evaluation = null;
  state.voiceTyped = false;

  clearTranscript();
  setView('live');
  startTimer();

  // Phase 2 replaces this with the real opening turn: the interviewer's greeting
  // and introduction, spoken, carrying the first question.
  addNotice('Interview starting… the interviewer will greet you and ask the first question.');
}

// Ends the interview and runs the evaluation. Which of the three causes ended it is
// recorded in state.endedReason for the export.
function endInterview(reason) {
  if (state.view !== 'live') return;
  state.endedReason = reason || 'end';
  state.finishedAt = Date.now();
  stopTimer();

  // Speech is cancelled and recognition stopped on every path out of the
  // interview; the camera tracks are stopped because a finished session with a
  // live camera is a light the user did not ask to keep on.
  if (typeof stopTTS === 'function') stopTTS();
  if (typeof stopListening === 'function') stopListening();

  setView('done');
  paintTimer();

  const elapsed = formatClock(elapsedSeconds());
  addNotice(`Interview finished after ${elapsed} (${endReasonText(state.endedReason)}). `
    + (state.answers.length ? '' : 'No answers were given, so no evaluation was produced.'));
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
  if (typeof stopListening === 'function') stopListening();
  if (typeof stopCamera === 'function') stopCamera();

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

// ---------- wiring ----------
function wireInterview() {
  els.btnSend.addEventListener('click', () => {
    if (typeof sendAnswer === 'function') sendAnswer();
  });
  els.btnPrimary.addEventListener('click', () => {
    if (state.view === 'ready') startInterview();
    else if (state.view === 'live') endInterview('end');
    else goToReady();
  });
}
