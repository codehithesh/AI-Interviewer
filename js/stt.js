// ============================================================
// SPEECH-TO-TEXT — voice reactions (native, no API)
// ============================================================
// Built on the browser's own SpeechRecognition: no speech API to pay for, no key
// to configure, nothing hosted by this project. Be precise about what that does
// and does not mean, because it is easy to oversell — in Chrome this is a
// SERVER-SIDE recogniser, so the microphone audio is streamed to Google to be
// transcribed and dictation does not work offline (hence the 'network' error
// handled below). That is the browser's behaviour, not a decision this app makes,
// but it is the one place where this app's data leaves the machine. Read-aloud
// (js/tts.js) really is fully local. See the README's Privacy section.
//
// The transcript is written straight into the reaction composer (js/composer.js);
// this file owns only the microphone and the recording state.
//
// A recording is NOT the same thing as one browser recognition session. Chrome
// ends its session on its own schedule — a pause it reads as the end of an
// utterance, an endpoint, a passing network error — and fires onend. Treating
// that as the user stopping is what cut the mic off a few seconds into a
// sentence. So the user's intent (wantListening) is tracked separately from
// whatever session happens to be running, and a fresh session is opened
// underneath the same recording until the user actually stops. The only things
// that end a recording are the mic button, closing the sheet, sending, and a
// fatal error such as a blocked microphone.

'use strict';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

// Chrome refuses to start a new session for a moment after the last one ended,
// and throws InvalidStateError if asked too soon.
const RESTART_MS = 250;
const MAX_RESTARTS = 5;      // consecutive failed starts before giving up
const MAX_ERRORS = 8;        // consecutive error-ended sessions before giving up

// Errors that mean the microphone itself is unusable, so retrying is pointless.
const FATAL_STT_ERRORS = ['not-allowed', 'service-not-allowed', 'audio-capture'];

let recognition = null;
let wantListening = false;   // the user's intent — outlives any single session
let committed = '';          // text finalised by sessions that have already ended
let sessionText = '';        // text the session running right now has heard
let restartTimer = null;
let restartFails = 0;
let errorSessions = 0;

// ---------- transcript ----------
// Join two fragments with exactly one space, and never leave a leading one.
function joinSpeech(a, b) { return (a + ' ' + b).replace(/\s+/g, ' ').trim(); }

// recBase is what the composer held before recording began, so dictation appends
// to whatever was already typed rather than replacing it.
function paintTranscript() {
  els.reactText.value = joinSpeech(state.recBase, joinSpeech(committed, sessionText));
  autoGrowComposer();
  updateControls();
}

// Fold the running session's text into the committed text. Called from onend and
// nowhere else: a session's transcript is only trustworthy once Chrome says the
// session is over.
function commitSession() {
  committed = joinSpeech(committed, sessionText);
  sessionText = '';
}

// ---------- session lifecycle ----------
function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!wantListening) return;
    try {
      recognition.start();
      restartFails = 0;
    } catch {
      // almost always InvalidStateError: the previous session has not released
      // the microphone yet. Retry briefly, then stop rather than spin.
      if (++restartFails > MAX_RESTARTS) {
        endListening();
        setStatus('Could not keep the microphone open — press the mic to try again', 'warn');
        return;
      }
      scheduleRestart();
    }
  }, RESTART_MS);
}

// Ends the recording for real: silences the microphone, clears the user's intent
// so no session reopens, and keeps everything heard so far. Safe to call at any
// time, including from inside an error handler and while no session is running.
function endListening() {
  wantListening = false;
  clearTimeout(restartTimer);
  restartTimer = null;
  // Stop the session rather than trusting the caller to have done it: otherwise a
  // fatal error would leave the microphone open with nothing left to close it,
  // and the next start() would throw because a session was still running.
  try { recognition.stop(); } catch { /* nothing running — fine */ }
  state.listening = false;
  els.btnMic.classList.remove('listening');
  els.btnMic.title = 'Native speech-to-text';
  // sessionText is deliberately left alone. stop() makes Chrome deliver one last,
  // more accurate final result and then onend; folding the interim text in here
  // would commit it and then append that final result after it, so the last
  // phrase would appear twice. onend stays the single commit point, and the
  // composer already shows the interim text, so nothing is lost by waiting.
}

// ---------- recording ----------
function toggleListening() {
  if (!recognition) return;
  if (state.listening) { stopListening(); return; }
  if (state.busyEval || !state.pending) return;

  state.recBase = els.reactText.value.trim();
  committed = '';
  sessionText = '';
  restartFails = 0;
  errorSessions = 0;
  wantListening = true;
  state.listening = true;
  els.btnMic.classList.add('listening'); // icon turns into icon + “Recording”
  els.btnMic.title = 'Recording — click to stop';
  setStatus('Listening… speak your reaction (native speech-to-text)');
  try {
    recognition.start();
  } catch (err) {
    endListening();
    // a blocked mic is a setting the user has to go and change; "busy" is just
    // this instant and stops being true the moment they press the mic again
    const blocked = err && err.name === 'NotAllowedError';
    setStatus(blocked
      ? 'Microphone is blocked — allow mic access for this page'
      : 'Mic is already busy — try again',
      blocked ? 'error' : 'warn');
  }
}

// Stop recording if it is running — safe to call at any time.
function stopListening() {
  if (!recognition || !state.listening) return;
  endListening();
}

// ---------- wiring ----------
function initSTT() {
  if (!SR) {
    // The one control that stays disabled, because it genuinely cannot work here.
    els.btnMic.disabled = true;
    els.btnMic.title = 'Speech recognition is not supported in this browser';
    return;
  }
  recognition = new SR();
  recognition.lang = (navigator.language || 'en-US').replace('_', '-');
  recognition.interimResults = true;
  recognition.continuous = true;   // ask for one long session; onend covers the rest
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let t = '';
    for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript;
    sessionText = t.trim();
    if (sessionText) {
      state.voiceTyped = true;
      errorSessions = 0;   // the pipeline is working — clear the error streak
    }
    paintTranscript();
  };

  // Every session end is a chance to keep going. Chrome ends its own session
  // after a pause, an endpoint or a passing network error; none of that is the
  // user stopping, so commit what this session heard and reopen underneath the
  // same recording. Nothing is repainted here: the composer already shows the
  // interim text, and committing does not change what that text reads as.
  //
  // Note what is deliberately NOT counted as a failure: a session that ends
  // having heard nothing. That is just the user thinking, and aborting after a
  // run of silent sessions would cut off the very people the mic is for.
  recognition.onend = () => {
    commitSession();
    if (wantListening) scheduleRestart();
  };

  recognition.onerror = (e) => {
    const code = e.error || 'unknown';
    if (code === 'aborted') return;     // our own stop() — the onend that follows is enough
    if (code === 'no-speech') return;   // a pause, not a failure — onend reopens
    if (FATAL_STT_ERRORS.indexOf(code) >= 0) {
      endListening();
      setStatus('Mic error: ' + (code === 'audio-capture'
        ? 'no microphone was found'
        : 'microphone access is blocked for this page'), 'error');
      return;
    }
    // Transient. Count it, so a permanently broken pipeline cannot reopen the
    // microphone forever and flood the status line. onresult clears the streak.
    if (++errorSessions > MAX_ERRORS) {
      endListening();
      setStatus('The microphone keeps failing (' + code + ') — press the mic to retry', 'error');
      return;
    }
    setStatus('Mic error: ' + code + ' — retrying', 'warn');
  };

  els.btnMic.addEventListener('click', toggleListening);
}
