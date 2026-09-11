// ============================================================
// INTERVIEW SCREEN — Ready / Live / Done, and the answer → question loop
// ============================================================
// The screen is the whole app, and it has exactly three states. They are class and
// DOM toggles inside this one document — nothing about a state change is written
// to the URL, and there is no router and no second page.
//
//   Ready   the initial view, and where a session that has been cleared waits. A
//           readiness card instead of a transcript; the composer is inert.
//   Live    reached by pressing [Start interview] — and by nothing else. This is
//           the only thing that begins an interview, which also makes it the user
//           gesture the browser's autoplay policy requires before speech may start.
//   Done    the Live layout with the session finished: composer and [+] disabled,
//           the evaluation as the last transcript item, the rail's button back to
//           [Start interview]. Not a third screen.
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

// Bumped by [Start interview]. A reply that arrives after the
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
//
// The action is a parameter because a second kind of turn carries the same button:
// a failed evaluation (js/evaluation.js) retries the evaluation, not the next
// question, and on the Done screen that is the only retryable thing there is — so
// the "this interview has ended" guard only applies to the interviewer path.
function retryRow(action) {
  const retry = action || requestInterviewerTurn;
  const row = document.createElement('div');
  row.className = 'bubble-actions';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn compact';
  btn.textContent = 'Try again';
  btn.title = 'Ask again — nothing said so far is lost';
  btn.addEventListener('click', () => {
    // A finished session keeps its transcript, so an old error turn can still be on
    // screen. Say why nothing happens rather than looking broken.
    if (retry === requestInterviewerTurn && state.view !== 'live') {
      setStatus('This interview has ended — press Start interview to run another', 'warn');
      return;
    }
    retry();
  });
  row.appendChild(btn);
  return row;
}

// The body of a bubble, shared by every module that renders a turn so the two
// security rules below cannot be applied in one place and forgotten in another:
// a model reply is the only thing that goes through the markdown parser, and it is
// that parser (js/markdown.js) which escapes before it writes a tag. Everything
// else — a typed answer, a notice, a provider error — is textContent, because
// textContent cannot become markup. A candidate answer is the one exception: when
// it carries a fenced snippet the fence has to be laid out, so it is rendered as
// markdown too — but only because hasCodeFence() proved there is a fence in it.
function bubbleBodyFor(turn) {
  const body = document.createElement('div');
  body.className = 'bubble-body';
  const md = typeof renderMarkdownInto === 'function';
  if (turn.role === 'ai' && turn.kind === 'question' && md) {
    renderMarkdownInto(body, turn.text);          // the model writes markdown
  } else if (turn.role === 'user' && hasCodeFence(turn.text) && md) {
    renderMarkdownInto(body, turn.text);          // prose + a fenced snippet
  } else {
    body.textContent = turn.text;                 // textContent: never markup
  }
  return body;
}

// ============================================================
// Reply masking
// ============================================================
// A display choice saved with the other preferences (js/store.js): when it is on,
// every interviewer reply is covered by a solid panel reading "Hidden". The text
// is NOT removed or hidden from the DOM — it stays in the bubble, in the model
// history, in speech and in the export — so the mask is a cover rather than a
// deletion, and turning the preference off brings every reply straight back.
// Candidate answers and notices are never masked; the evaluation card is not a
// turn at all and is untouched.
//
// The cover itself is an element appended to each question bubble (appendBubble).
// This only toggles the class on the transcript that makes those covers show, so
// switching the preference costs no re-render and every bubble already on screen —
// and every one added later — follows along.

// What is actually stored. `prefs` lives in js/settings.js and is loaded at boot.
function aiRepliesMasked() {
  return !!(prefs && prefs.maskAi);
}

// The Settings checkbox previews through the `on` argument; called with nothing,
// it follows the stored preference — which is how boot and a discarded draft
// (closeSettings) both repaint the chat from what is really saved.
function applyReplyMask(on) {
  const masked = typeof on === 'boolean' ? on : aiRepliesMasked();
  els.transcript.classList.toggle('mask-ai', masked);
}

// One AI error bubble, wherever it came from: a failed question request here, a
// failed evaluation in js/evaluation.js. Shared for the same reason as the body
// above — one place decides what an error turn looks like.
function addErrorBubble(message, retryAction) {
  return addTurn({ role: 'ai', kind: 'error', text: message, retry: true, retryAction });
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

  const body = bubbleBodyFor(turn);
  bubble.appendChild(body);

  // The cover for a masked interviewer reply. It is always in the bubble and the
  // transcript's .mask-ai class is what shows it, so the preference can change
  // without rebuilding the transcript. aria-hidden because this is a visual cover,
  // not the content: the reply stays in the accessibility tree and is read aloud
  // exactly as before, which is the point — masked, not made invisible.
  if (turn.role === 'ai' && turn.kind === 'question') {
    const mask = document.createElement('div');
    mask.className = 'bubble-mask';
    mask.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'bubble-mask-label';
    label.textContent = 'Hidden';
    mask.appendChild(label);
    bubble.appendChild(mask);
  }

  if (turn.retry) bubble.appendChild(retryRow(turn.retryAction));

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
  row('Duration', `${cfg.duration} minute${cfg.duration === 1 ? '' : 's'}`);
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
    + 'Answer by voice or by typing. Press Start interview in the panel on the left to begin.';
  card.appendChild(note);

  // No [Start interview] button on this card. There is exactly one control that
  // begins a session — the rail button in the left panel — and a second copy here
  // gave the same action two names on one screen. The line above points at it.

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
// Counts DOWN from the configured duration and ends the interview at zero. It never
// counts up: a duration is always in force (the default when Settings leave it
// blank — see DEFAULT_DURATION_MINUTES in js/store.js), so there is no unlimited
// session for an elapsed-time readout to describe. The readout is text, and its
// title states the same thing in words, because the timer may not be communicated
// by digits alone (§15).

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

// The fallback is belt-and-braces: snapshotConfig() and js/store.js both guarantee a
// positive duration, so this only catches a config that was never snapshotted.
function sessionLimitSeconds() {
  const minutes = state.config.duration > 0 ? state.config.duration : DEFAULT_DURATION_MINUTES;
  return minutes * 60;
}

function remainingSeconds() {
  return sessionLimitSeconds() - elapsedSeconds();
}

function paintTimer() {
  const left = Math.max(0, remainingSeconds());
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
// [Start interview] and [END] — so a transition is what these belong to. Boot sets
// 'ready' over the 'ready' state.js already holds, which the guard below makes a
// no-op: the readiness card explains itself, and a toast repeating it on load would
// be noise. The live activity state is not lost — the §8.3 status line carries it
// continuously.
function setView(next) {
  const changed = state.view !== next;
  state.view = next;
  els.view.dataset.state = next;
  updateControls();
  if (!changed) return;
  if (next === 'ready') setStatus('Ready — press Start interview');
  else if (next === 'done') setStatus('Interview finished — export it, or start a new one');
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
    duration: typeof c.duration === 'number' && c.duration > 0 ? c.duration : DEFAULT_DURATION_MINUTES,
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

  // §11: the evaluation runs once, when the interview ends, over the whole
  // transcript — and only when there is an answer to evaluate. "Once" is enforced
  // inside js/evaluation.js as well, so a second [END] or a stray timer tick cannot
  // buy a second call. The Done button stays live throughout anyway — a hanging
  // provider must not strand the user — so it is the session token, not `state.busy`,
  // that keeps a result for a session the user has since replaced off the screen.
  if (state.answers.length && typeof runEvaluation === 'function') runEvaluation();
}

function endReasonText(reason) {
  return reason === 'timer' ? 'time was up'
    : reason === 'question_cap' ? 'the question limit was reached'
    : 'you ended it';
}

// resetSession() — clear the session and return to Ready WITHOUT touching the saved
// configuration. Every piece of session state is reset here and nowhere else. It is
// reached from [Start interview] on the Done screen, which is the only way back to a
// new interview now that there is no separate [Restart].
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

// [Start interview] on the Done screen. The button carries one label and one
// promise, so the finished session is cleared inside the same press rather than
// behind a separate [Restart] — the reset and the start are one action to the user.
// resetSession() leaves the view on Ready, which is what startInterview() requires,
// so the pair composes without startInterview() needing a Done case of its own. If
// startInterview() then refuses (no API key), it has already said so in plain
// language and the user is simply left on Ready with the readiness card.
function startNewInterview() {
  resetSession();
  startInterview();
}

// ============================================================
// The answer → question loop
// ============================================================

// A failed turn is shown in the transcript, not thrown: the interview stays alive
// whatever the provider did. The turn carries [Try again] because the answer is
// already in the history — only the request failed.
function reportTurnError(message, opts) {
  const o = opts || {};
  addErrorBubble(message);
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

  // A turn cannot be requested past the cap, however the request got here (an
  // answer, Enter, [Try again]). The cap normally ends the interview first, so this
  // is the belt to that brace — it also covers the moment between the last question
  // being asked and the cap being applied, when the composer is briefly answerable.
  if (state.config.questions && state.questionNumber >= state.config.questions) return;

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

  // [END], the timer, the question cap or a new [Start interview] may all have landed
  // while the request was in the air. The turn is dropped rather than shown in a dead
  // session.
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

  // The question cap is counted HERE, by the client, and not by asking the model
  // whether it has finished (§10.4). This runs whatever the model claimed — a model
  // that says "that was my last question" and then asks a sixth one is capped, and
  // so is one that forgets to declare itself done. The wait is for the candidate to
  // HEAR the last question: ending the instant it arrived would tear the screen away
  // mid-sentence and cut off speech that was already queued.
  if (state.config.questions && state.questionNumber >= state.config.questions) {
    awaitSpokenTurn();
  }
  return true;
}

// Requests run back to back to back on their own: the reply to an answer IS the next
// question, so with no cap there is nothing to wait for. The cap is the one place
// where the client has to wait for the user rather than for the model, and the wait
// is real — the composer unlocks the moment TTS stops, so ending the interview the
// instant the last question *arrived* would tear the screen away mid-sentence and
// replace speech the candidate never heard with an evaluation.
//
// So the cap fires once the last question has actually been spoken, with a hard
// deadline as the backstop: the engine can be missing, muted, paused, or wedged, and
// a cap that never fires would leave the interview unable to end itself.
const CAP_SPEECH_GRACE_MS = 15000;
const CAP_POLL_MS = 200;

function awaitSpokenTurn() {
  const token = sessionId;
  const deadline = Date.now() + CAP_SPEECH_GRACE_MS;
  const check = () => {
    if (token !== sessionId || state.view !== 'live') return;   // ended, restarted or replaced
    if (!state.speaking || Date.now() >= deadline) { endInterview('question_cap'); return; }
    setTimeout(check, CAP_POLL_MS);
  };
  setTimeout(check, CAP_POLL_MS);
}

// The session token, so js/evaluation.js can tell whether the interview it was run
// for is still the one on screen. Reading it cannot change it — only startInterview()
// and resetSession() bump it.
function getInterviewSessionId() { return sessionId; }

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
    if (state.view === 'live') endInterview('end');
    else if (state.view === 'done') startNewInterview();
    else startInterview();
  });
}
