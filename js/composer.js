// ============================================================
// COMPOSER + CONTROL STATE
// ============================================================
// Two halves of the same thing: the auto-growing answer field, and the single
// place that decides which controls are enabled and what the status line says.
// Every module that changes what the user can do calls updateControls() rather
// than poking .disabled itself.
//
// The screen state (`state.view`) and the activity state (busy / speaking /
// listening) are separate axes and both matter:
//
//   view = ready   the composer is visible but INERT — [Cam], which lives in the
//                  rail, is the only live control, so the user can check their
//                  camera before starting. [Start interview] is the only thing that
//                  begins a session.
//   view = live    the interview is running; the activity state then decides.
//   view = done    composer and [+] are disabled; [Cam] stays available and export
//                  remains enabled, because a finished session can always be saved.
//
// The mic is never enabled while TTS is speaking, and a new utterance is never
// started while the mic is live (§8.3) — that is what stops the recogniser from
// transcribing the interviewer's own voice.

'use strict';

// Is anything turning the composer off for a reason other than the screen state?
// Kept in one function so the rule reads only once.
function composerInert() {
  return state.view !== 'live' || state.busy || state.speaking;
}

// Starts as a single-line field, grows as the text wraps, and scrolls once it
// hits the CSS max-height. One line is exactly 34px — the height of every button
// beside it — so the row stays flush; see the composer rules in styles.css.
function autoGrowComposer() {
  const ta = els.imText;
  const cs = getComputedStyle(ta);
  const max = parseFloat(cs.maxHeight) || 140;
  // scrollHeight is content + padding and stops at the border, while the field is
  // border-box: without adding the border back the box is set 2px short of its own
  // content on every line, which makes it scroll by a sliver as you type.
  const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  ta.style.height = 'auto';               // measure the natural content height
  const h = ta.scrollHeight + border;
  ta.style.height = h + 'px';             // CSS max-height clamps the grown box
  ta.classList.toggle('grown', h > max + 1);
}

// The status line, as a table rather than a chain of ternaries so the four states
// in §8.3 can be read off against the spec. 'Ready' covers both the Ready screen
// and an idle live interview — the mic's enabled state is what tells them apart.
function activityState() {
  if (state.busy) return 'thinking';
  if (state.speaking) return 'speaking';
  if (state.listening) return 'listening';
  return 'ready';
}

const STATUS_TEXT = {
  thinking: 'Thinking…',
  speaking: 'Interviewer speaking…',
  listening: 'Listening…',
  ready: 'Ready',
};

function updateControls() {
  const inert = composerInert();
  const live = state.view === 'live';
  const hasText = !!els.imText.value.trim();

  // ---------- the composer ----------
  els.imText.disabled = inert;
  els.btnSend.disabled = !live || inert || !hasText;
  els.btnSend.title = state.busy ? 'Waiting for the interviewer…'
    : !live ? 'Start the interview first'
    : state.speaking ? 'Wait until the interviewer stops speaking'
    : 'Send your answer';
  els.btnPlus.disabled = inert;
  // When this browser has no recognition at all the mic button is disabled for
  // good (set once by initSTT), so only touch it when recognition exists.
  if (sttSupported()) els.btnMic.disabled = inert || !live;

  // [Cam] belongs to the rail, next to [Start interview] / [END] / [Restart]: it is
  // the one control that stays live on every screen state, including Ready and Done,
  // because the camera is a local self-view and not part of the interview. When this
  // browser has no getUserMedia at all the button is disabled for good (set once by
  // initParticipants), so only touch it when a camera is possible.
  if (cameraSupported()) els.btnCam.disabled = false;

  // ---------- the rail's action button ----------
  // [Start interview] is guarded against a double press, but [END] is NOT disabled
  // while a request is in the air: §4.2 and §10.4 both say it ends the interview
  // immediately, and a slow or hanging provider must never leave the user with no
  // way out of a live session. A reply that lands after the end is dropped in
  // js/interview.js.
  els.btnPrimary.disabled = state.busy && state.view === 'ready';
  els.btnPrimary.textContent = state.view === 'ready' ? 'Start interview'
    : state.view === 'done' ? 'Restart'
    : 'END';
  els.btnPrimary.title = state.view === 'ready' ? 'Start the interview'
    : state.view === 'done' ? 'Clear this session and return to the start'
    : 'End the interview and get an evaluation';
  els.btnPrimary.classList.toggle('danger', state.view === 'live');

  // ---------- export ----------
  // Available whenever there is something to save, so a live session can be
  // exported too, not only a finished one.
  els.btnExport.disabled = state.transcript.length === 0;
  if (els.btnExport.disabled && typeof closeExportMenu === 'function') closeExportMenu();

  // ---------- speech bar ----------
  // The bar sits directly under the header and always shows the voice, the speed,
  // the auto-speak switch and the three buttons; this is the one place that
  // decides what they may do. Read replays the newest message, so it needs one to
  // exist; pause and stop need a message that is actually being read.
  const reply = ttsAvailable() ? latestAiReply() : null;
  const reading = state.tts.active;
  els.btnRead.disabled = !reply || reading || state.busy;
  els.btnRead.title = state.busy ? 'Waiting for the interviewer…' : 'Read the latest message aloud';
  els.btnPause.disabled = !reading || state.busy;
  els.btnStop.disabled = !reading;
  setPauseBtn(state.tts.paused ? 'Resume' : 'Pause');

  // ---------- the status readout (§8.3) ----------
  // The bar exists only while there is something to report: thinking, speaking or
  // listening. A screen that has settled — Ready, or a finished interview — has no
  // activity to name, so the whole strip goes, background included, rather than
  // sitting above the composer holding a word that never changes. The class is what
  // removes it (styles.css), so the box does not linger empty.
  //
  // Its text is kept up to date even while the bar is hidden. The element is out of
  // the accessibility tree when it is not displayed, so nothing is announced then;
  // leaving the current word in place means that when the bar comes back, the live
  // region is showing the right state rather than being refilled at the same moment
  // it becomes visible, which browsers may miss.
  //
  // The longer Ready and Done nudges are toasts, posted once by setView() in
  // js/interview.js — they belong to the transition into those screens, not to
  // every pass through here.
  const activity = activityState();
  const paused = state.tts.paused;
  els.status.textContent = paused ? 'Paused — press Resume to carry on' : STATUS_TEXT[activity];

  // Only while a request is in the air: the sweep is the "still working" signal.
  els.statusBar.classList.toggle('shimmer', activity === 'thinking');

  const statusShown = state.view === 'live' && (state.busy || state.speaking || state.listening);
  els.statusBar.classList.toggle('hidden', !statusShown);
}

// Typing is the user's own hand, so the answer being composed is no longer one the
// mic produced. The dictation path writes .value directly, which fires no 'input'
// event, so a spoken answer keeps its `· mic` tag until it is actually sent.
function onComposerInput() {
  state.voiceTyped = false;
  autoGrowComposer();
  updateControls();
}

function wireComposer() {
  els.imText.addEventListener('input', onComposerInput);
  els.imText.addEventListener('keydown', (e) => {
    // Enter sends, Shift+Enter newlines (§15). sendAnswer() re-checks the guard,
    // so holding Enter cannot slip a second request past this.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.btnSend.click(); }
  });
}
