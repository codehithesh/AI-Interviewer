// ============================================================
// POSITION MARKER (T) — where in the text you have read to
// ============================================================
// The marker is the paragraph you have read up to. Everything before it is the
// context sent to the evaluator, everything after it is dimmed in the reading
// pane, and read-aloud both advances and follows it.

'use strict';

function setMarker(i) {
  state.markerP = i;
  if (state.pending) state.pending.markerP = i;
  renderReadingState();
  updateReadPos();
  updateControls();
}

function renderReadingState() {
  const readingNow = state.tts.active && state.tts.idx >= 0 ? state.tts.idx : -1;
  els.reading.querySelectorAll('p.para').forEach((el) => {
    const i = parseInt(el.dataset.p, 10);
    el.classList.toggle('before', i < state.markerP);
    el.classList.toggle('marker', i === state.markerP);
    el.classList.toggle('after', i > state.markerP);
    el.classList.toggle('reading-now', i === readingNow);
  });
}

function updateReadPos() {
  // The bar exists only to report where you are, so it stays out of the way until
  // a paragraph has actually been marked as read. While it is hidden, the floating
  // React button and the toast stack drop down to the bottom edge — this body class is
  // what tells the stylesheet which of the two positions to use.
  const marked = state.paras.length > 0 && state.markerP >= 0;
  els.readerToolbar.classList.toggle('hidden', !marked);
  document.body.classList.toggle('has-status', marked);
  if (!marked) return;
  const chars = state.prefixLen[state.markerP] || 0;
  const pct = state.totalChars ? chars / state.totalChars : 0;
  els.readPos.textContent =
    `At ¶ ${state.markerP + 1} of ${state.paras.length} · ${fmtCount(chars)} chars · ${fmtPct(pct)} of text`;
}
