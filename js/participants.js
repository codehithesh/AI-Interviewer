// ============================================================
// PARTICIPANTS — the AI tile, and the candidate self-view
// ============================================================
// The two tiles on the left rail, and the only pieces of media in the app (§6).
//
//   · the AI tile — a portrait served from this repo, filling the card edge to
//     edge with the name laid over its corner. It carries no speaking indicator:
//     the voice is audible, the status line says "Interviewer speaking…", and a
//     decorative animation on top of both was one signal too many.
//
//   · the candidate tile — a LOCAL self-view. The stream is never recorded,
//     never uploaded and never sent to any provider, and switching [Cam] off
//     stops its tracks outright. If permission is denied, or there is no camera,
//     the tile falls back to an initials placeholder and says why in plain
//     language; the interview carries on either way.
//
// Nothing here enumerates devices or reads a device label. Labels are blank until
// the user has granted permission, and asking for them before the prompt is a
// fingerprinting surface this app has no use for: getUserMedia({video:true}) is
// itself what raises the prompt, and that is the first call made.

'use strict';

// ============================================================
// The candidate tile: the self-view
// ============================================================

const CAMERA_PRIVACY_NOTE =
  'Your camera is a self-view only — nothing is recorded, uploaded or sent to the AI.';

// The user's intent, tracked separately from the stream that happens to exist —
// the same split js/stt.js makes for the microphone, and for the same reason: the
// permission prompt can sit open for as long as the user likes, and [Cam] may be
// pressed again while it is up.
let cameraWanted = false;
let cameraPending = false;

function cameraSupported() {
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

// Why a camera could not be started, in plain language (§14). The raw DOMException
// name is deliberately not the message: it tells the person reading it nothing.
function cameraFailureText(err) {
  const name = (err && err.name) || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was denied — allow the camera for this page and press [Cam] again. '
      + 'The interview carries on either way.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device — the interview carries on without a self-view.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy in another app — close it and press [Cam] again. '
      + 'The interview carries on either way.';
  }
  return 'The camera could not be started — the interview carries on without a self-view.';
}

// The placeholder shown while there is no self-view: before [Cam] is ever pressed,
// after it is switched off, and when it could not be started at all. There is no
// candidate name to collect — the tile is the person at the keyboard — so this is
// the initials of the tile's own label ("You" → "Y").
function initialsFor(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 1);
  return letters.toUpperCase();
}

// One place that decides what the tile and the [Cam] button look like, so the two
// can never disagree about whether the camera is on. The button's pressed state is
// its aria-pressed value — that is what the CSS keys off, and what a screen reader
// reports — rather than a class that could drift away from the real state.
function setCameraUI(on) {
  state.cameraOn = on;
  els.video.classList.toggle('hidden', !on);
  els.initials.classList.toggle('hidden', on);
  els.btnCam.setAttribute('aria-pressed', on ? 'true' : 'false');
  els.btnCam.title = on ? 'Turn your camera off' : 'Turn your camera on';
  els.btnCam.setAttribute('aria-label', els.btnCam.title);
}

function stopStreamTracks(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach((track) => {
    try { track.stop(); } catch { /* already stopped — nothing to release */ }
  });
}

// Leaving the camera on after the interview is a light the user did not ask to
// keep on, so §10.4 calls this on end, [Restart] and [Cam] off alike. Safe to call
// when nothing is running.
function stopCamera() {
  cameraWanted = false;
  const stream = state.stream;
  state.stream = null;
  stopStreamTracks(stream);
  if (els.video) {
    try { els.video.pause(); } catch { /* nothing was playing */ }
    els.video.srcObject = null;      // drop the last frame as well as the tracks
  }
  setCameraUI(false);
}

// [Cam]. On: ask for the camera. Off: stop the tracks there and then.
async function toggleCamera() {
  if (state.cameraOn) { stopCamera(); return; }
  if (cameraPending) { cameraWanted = false; return; }   // pressed again while the prompt was up

  if (!cameraSupported()) {
    els.btnCam.disabled = true;      // no getUserMedia at all — never offer it again
    setStatus('This browser cannot show a camera self-view — the interview works without one', 'warn');
    return;
  }

  cameraWanted = true;
  cameraPending = true;
  let stream;
  try {
    // Video only. No audio track is requested, so [Cam] can never quietly become a
    // second microphone alongside [Mic].
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    cameraPending = false;
    stopCamera();
    const reason = cameraFailureText(err);
    els.initials.title = reason;     // hovering the placeholder says why it is there
    setStatus(reason, 'warn');
    return;
  }
  cameraPending = false;

  // A stream that arrived after the user changed their mind, or after the session
  // ended, is not wanted: stop it rather than switching the camera on.
  if (!cameraWanted) { stopStreamTracks(stream); return; }

  state.stream = stream;
  els.video.srcObject = stream;
  els.initials.title = '';
  setCameraUI(true);
  // A refusal here is not a failure — the first frame is already on screen, and an
  // unhandled rejection would only reach the boot guard and blank the page.
  try { await els.video.play(); } catch { /* the tile keeps the frame it has */ }
}

// ---------- wiring ----------
function initParticipants() {
  els.candidateTile.title = CAMERA_PRIVACY_NOTE;
  els.initials.textContent = initialsFor(els.candidateName.textContent);
  setCameraUI(false);

  if (!cameraSupported()) {
    // Disabled once, with a reason in its tooltip; updateControls() leaves a button
    // alone that this browser can never honour.
    els.btnCam.disabled = true;
    els.btnCam.title = 'This browser cannot show a camera self-view';
    els.btnCam.setAttribute('aria-label', els.btnCam.title);
    return;
  }
  els.btnCam.addEventListener('click', toggleCamera);
}
