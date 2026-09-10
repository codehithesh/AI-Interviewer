// ============================================================
// COMPOSER + CONTROL STATE
// ============================================================
// Two halves of the same thing: the auto-growing message input, and the single
// place that decides which controls are enabled and what the hint under the
// composer says. Every module that changes what the user can do calls
// updateControls() rather than poking .disabled itself.

'use strict';

// Starts as a single-line field, grows as the text wraps, and scrolls
// once it hits the CSS max-height.
function autoGrowComposer() {
  const ta = els.chatText;
  const max = parseFloat(getComputedStyle(ta).maxHeight) || 140;
  ta.style.height = 'auto';               // measure the natural content height
  const h = ta.scrollHeight;
  ta.style.height = h + 'px';             // CSS max-height clamps the grown box
  ta.classList.toggle('grown', h > max + 1);
}

function updateControls() {
  const hasText = !!els.chatText.value.trim();

  // Send needs something to send, and no request may be in flight.
  els.btnSend.disabled = state.busy || !hasText;
  els.btnSend.title = state.busy ? 'Waiting for the reply…' : 'Send';

  // The mic is never live while a reply is being read or requested: the
  // recogniser would otherwise transcribe the AI's own voice. When this browser
  // has no recognition at all the button stays disabled for good (set once by
  // initSTT), so only touch it when recognition exists.
  if (sttSupported()) els.btnMic.disabled = state.busy || state.speaking;

  els.btnExport.disabled = state.transcript.length === 0;
  if (els.btnExport.disabled) closeExportMenu();

  // ---------- speech bar ----------
  // The bar sits directly under the nav bar and always shows the voice, the speed
  // and the three buttons; this is the one place that decides what they may do.
  // Read replays the newest reply, so it needs one to exist; pause and stop need a
  // reply that is actually being read.
  const reply = ttsAvailable() ? latestAiReply() : null;
  const reading = state.tts.active;
  els.btnRead.disabled = !reply || reading || state.busy;
  els.btnRead.title = state.busy ? 'Waiting for the reply…' : 'Read the latest reply aloud';
  els.btnPause.disabled = !reading || state.busy;
  els.btnStop.disabled = !reading;
  setPauseBtn(state.tts.paused ? 'Resume' : 'Pause');

  els.chatHint.textContent = state.busy ? 'Thinking…'
    : state.tts.paused ? 'Paused — press Resume to carry on'
    : state.speaking ? 'Reading the reply aloud…'
    : state.listening ? 'Listening…'
    : 'Ready';
}

function wireComposer() {
  els.chatText.addEventListener('input', autoGrowComposer);
  els.chatText.addEventListener('input', updateControls);
  els.chatText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.btnSend.click(); }
  });
}
