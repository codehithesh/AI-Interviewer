// ============================================================
// TEXT-TO-SPEECH — replies read aloud (native, no API)
// ============================================================
// Built entirely on window.speechSynthesis with the OS voices: nothing is
// uploaded and no speech service is involved. Voice, rate and auto-speak are
// chosen in the speech bar (js/settings.js stores them); the words come from the
// interview screen (js/interview.js).

'use strict';

const synth = window.speechSynthesis || null;

// Everything that has to redraw when the speaking state flips registers here: the
// composer, which decides whether the microphone may be live (§8.3), and the
// participants rail, whose wiggle must move only while there is real speech (§6).
// Two different modules, so it is a list rather than a single callback.
const speakingListeners = [];

function addSpeakingListener(fn) {
  if (typeof fn === 'function' && speakingListeners.indexOf(fn) < 0) speakingListeners.push(fn);
}

// Pausing and resuming flip no top-level flag that setSpeaking() watches, so the
// transport asks for a refresh explicitly through this.
function notifySpeakingChange() {
  speakingListeners.forEach((fn) => fn());
}

function setSpeaking(v) {
  if (state.speaking === v) return;
  state.speaking = v;
  notifySpeakingChange();
}

// Whether this browser can speak at all — without it the transport bar stays hidden.
function ttsAvailable() { return !!synth; }

// The newest completed reply: what the transport reads, and the reason the bar is
// on screen at all. An interviewer turn is `kind: 'question'` (the opening greeting
// counts as one of those); 'text' is still accepted so an older turn shape cannot
// silently disable the Read button. Errors are not read aloud, so they are skipped.
function latestAiReply() {
  for (let i = state.transcript.length - 1; i >= 0; i -= 1) {
    const t = state.transcript[i];
    if (t.role === 'ai' && (t.kind === 'question' || t.kind === 'text') && t.text) return t;
  }
  return null;
}

// ---------- voices ----------
// The <select> is rebuilt from the browser's voice list. Chrome fills that list
// asynchronously, so an empty list at boot is normal — 'voiceschanged' is what
// eventually makes the saved voice selectable.
function populateVoices() {
  if (!synth || !els.voiceSelect) return;
  const voices = synth.getVoices();
  if (!voices.length) return;
  const cur = els.voiceSelect.value || state.speech.voice;
  els.voiceSelect.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = 'System default';
  els.voiceSelect.appendChild(def);
  for (const v of voices) {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    els.voiceSelect.appendChild(o);
  }
  els.voiceSelect.value = cur;
}

function activeVoice() {
  if (!synth || !state.speech.voice) return null;
  return synth.getVoices().find((v) => v.name === state.speech.voice) || null;
}

// ---------- speaking ----------
// A reply is written for the eye: markers and URLs are not words, and a reader that
// says "asterisk asterisk" or spells out a link is worse than no reader at all. So
// spoken text goes through markdownToPlain() (js/markdown.js) first — the same
// parser the bubble is rendered with, so what is heard matches what is seen.
function speakReply(text) { speakText(markdownToPlain(text)); }

// speakText() is the literal layer: hand it a string and it is read aloud as written.
function speakText(text) {
  if (!synth || !text) return;
  stopTTS();                     // one reply at a time — never overlap two

  const utter = new SpeechSynthesisUtterance(text);
  const v = activeVoice();
  if (v) utter.voice = v;
  utter.rate = state.speech.rate || 1;

  // Every handler checks that it still owns the current utterance. cancel() fires
  // the old utterance's events asynchronously, and a stale onend landing after a
  // new reply started would clear the speaking flag while the new one is talking.
  utter.onend = () => {
    if (state.tts.utter !== utter) return;
    state.tts.utter = null;
    state.tts.active = false;
    state.tts.paused = false;
    setSpeaking(false);
  };
  utter.onerror = (e) => {
    if (state.tts.utter !== utter) return;
    state.tts.utter = null;
    state.tts.active = false;
    state.tts.paused = false;
    setSpeaking(false);
    if (e.error === 'interrupted' || e.error === 'canceled') return;  // our own stop()
    setStatus('Could not read the reply aloud (' + (e.error || 'unknown') + ')', 'warn');
  };

  state.tts.utter = utter;
  state.tts.active = true;
  state.tts.paused = false;
  // Optimistic: the mic must be locked out from the moment a reply is queued, not
  // from whenever the engine gets round to firing onstart.
  setSpeaking(true);
  try {
    synth.speak(utter);
  } catch {
    state.tts.utter = null;
    state.tts.active = false;
    setSpeaking(false);
  }
}

// Silence the voice. Safe to call at any time, including when nothing is speaking.
function stopTTS() {
  const had = state.tts.utter;
  state.tts.utter = null;        // clears ownership first, so stale events bail out
  state.tts.active = false;
  state.tts.paused = false;
  if (synth) { try { synth.cancel(); } catch { /* noop */ } }
  if (had) setSpeaking(false);
}

// ---------- transport: pause / resume / replay ----------
// speechSynthesis pauses and resumes an in-flight utterance in place, so a paused
// reply carries on from the same word rather than starting over.

function pauseTTS() {
  if (!synth || !state.tts.active || state.tts.paused) return;
  try { synth.pause(); } catch { return; }
  state.tts.paused = true;
  notifySpeakingChange();
}

function resumeTTS() {
  if (!synth || !state.tts.active || !state.tts.paused) return;
  try { synth.resume(); } catch { return; }
  state.tts.paused = false;
  notifySpeakingChange();
}

function togglePauseTTS() {
  if (state.tts.paused) resumeTTS(); else pauseTTS();
}

// The pause button keeps its shape while the label swaps between Pause / Resume —
// exactly as it did in the extension — so the control does not jump around as a
// reply is paused and picked up again. Built with DOM calls rather than innerHTML,
// which nothing in this app renders into.
function setPauseBtn(label) {
  if (els.btnPause.dataset.label === label) return;
  els.btnPause.dataset.label = label;
  const ic = document.createElement('span');
  ic.className = 'ic ic-' + (label === 'Resume' ? 'play' : 'pause');
  ic.setAttribute('aria-hidden', 'true');
  els.btnPause.textContent = '';
  els.btnPause.appendChild(ic);
  els.btnPause.appendChild(document.createTextNode(label));
  els.btnPause.title = label;
}

// The [▶] control. A paused reply continues where it left off; otherwise the
// newest reply is read again from the top.
function speakLatestReply() {
  if (!synth) return;
  if (state.tts.active && state.tts.paused) { resumeTTS(); return; }
  const reply = latestAiReply();
  if (reply) speakReply(reply.text);
}

// ---------- wiring ----------
function initTTS(onState) {
  addSpeakingListener(onState);

  // The speech bar is wired before the capability check so the buttons never end
  // up as dead listeners; updateControls() keeps them disabled when there is no synth.
  els.btnRead.addEventListener('click', speakLatestReply);
  els.btnPause.addEventListener('click', togglePauseTTS);
  els.btnStop.addEventListener('click', stopTTS);

  if (!synth) {
    // The reply is still shown; say once that it cannot be heard.
    if (els.voiceSelect) els.voiceSelect.disabled = true;
    if (els.rateSelect) els.rateSelect.disabled = true;
    setStatus('This browser has no speech synthesis — replies will not be read aloud', 'warn');
    return;
  }
  populateVoices();
  synth.addEventListener('voiceschanged', populateVoices);
}
