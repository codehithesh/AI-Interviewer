// ============================================================
// TEXT-TO-SPEECH — read aloud, paragraph by paragraph (native, no API)
// ============================================================
// Built entirely on window.speechSynthesis with the OS voices: nothing is
// uploaded and no speech service is involved. The reading marker and the
// paragraph highlighting live in js/marker.js; this file only drives the voice
// and reports progress back to it.

'use strict';

const synth = window.speechSynthesis || null;

// ---------- voices ----------
function populateVoices() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;
  const cur = els.voiceSelect.value;
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
  if (cur) els.voiceSelect.value = cur;
}

function activeVoice() {
  if (!synth) return null;
  const name = els.voiceSelect.value;
  if (!name) return null;
  return synth.getVoices().find((v) => v.name === name) || null;
}

// pause button keeps its icon while the label swaps between Pause / Resume
function setPauseBtn(label) {
  const ic = label === 'Resume' ? 'play' : 'pause';
  els.btnPause.innerHTML = `<span class="ic ic-${ic}" aria-hidden="true"></span>${label}`;
}

// ---------- reading ----------
function readAloudFrom(startP) {
  if (!synth || !state.paras.length) return;
  if (startP < 0 || startP >= state.paras.length) {
    setStatus('Nothing left to read — mark an earlier paragraph to re-read', 'warn');
    return;
  }
  stopTTS();
  state.tts.active = true;
  state.tts.paused = false;
  state.tts.idx = startP;
  els.btnPause.disabled = false;
  els.btnStop.disabled = false;
  setPauseBtn('Pause');
  setStatus('Reading aloud — native speech, nothing uploaded');
  renderReadingState();
  speakNext();
}

function speakNext() {
  if (!state.tts.active) return;
  const i = state.tts.idx;
  if (i >= state.paras.length) {
    stopTTS(true);
    setStatus('Read-aloud finished', 'success');
    return;
  }
  const utter = new SpeechSynthesisUtterance(state.paras[i].text);
  const v = activeVoice();
  if (v) utter.voice = v;
  utter.rate = parseFloat(els.rateSelect.value) || 1;
  state.tts.utter = utter;
  utter.onend = () => {
    if (!state.tts.active) return;
    setMarker(i);                      // this paragraph is now fully read
    if (i + 1 < state.paras.length) {
      state.tts.idx = i + 1;
      speakNext();
    } else {
      stopTTS(true);
      setStatus('Read-aloud finished', 'success');
    }
  };
  utter.onerror = (e) => {
    if (e.error === 'interrupted' || e.error === 'canceled') return; // cancelled by us
    stopTTS();
    setStatus('Read-aloud error: ' + (e.error || 'unknown'), 'error');
  };
  renderReadingState();
  synth.speak(utter);
}

// `finished` separates "read to the end" from "the user stopped": stopTTS() is
// also called to silence the voice when a new source loads (js/reader.js) or when
// a reaction starts, and those must not announce that reading was stopped.
function stopTTS(finished) {
  if (synth) {
    try { synth.cancel(); } catch { /* noop */ }
  }
  const wasActive = state.tts.active;
  state.tts.active = false;
  state.tts.paused = false;
  state.tts.idx = -1;
  state.tts.utter = null;
  setPauseBtn('Pause');
  els.btnPause.disabled = true;
  els.btnStop.disabled = true;
  if (wasActive && !finished) setStatus('Stopped reading');
  if (state.paras.length) renderReadingState();
}

// ---------- wiring ----------
function initTTS() {
  if (!synth) {
    els.btnRead.disabled = els.btnPause.disabled = els.btnStop.disabled = true;
    els.voiceSelect.disabled = els.rateSelect.disabled = true;
    return;
  }
  populateVoices();
  synth.addEventListener('voiceschanged', populateVoices);

  els.btnRead.addEventListener('click', () => {
    if (!state.paras.length) { setStatus('Load text first', 'warn'); return; }
    // Read from the selected paragraph itself — not the one after it.
    if (state.markerP < 0) {
      setMarker(0);
      readAloudFrom(0);
    } else {
      readAloudFrom(state.markerP);
    }
  });

  els.btnPause.addEventListener('click', () => {
    if (!state.tts.active) return;
    if (state.tts.paused) {
      synth.resume();
      state.tts.paused = false;
      setPauseBtn('Pause');
      setStatus('Reading…');
    } else {
      synth.pause();
      state.tts.paused = true;
      setPauseBtn('Resume');
      setStatus('Paused — react here if you like');
    }
  });

  els.btnStop.addEventListener('click', () => stopTTS(false));
}
