// ============================================================
// COMPOSER + CONTROL STATE
// ============================================================
// Two halves of the same thing: the auto-growing reaction input, and the single
// place that decides which controls are enabled and what the hint under the
// composer says. Every module that changes what the user can do calls
// updateControls() rather than poking .disabled itself.

'use strict';

// Starts as a single-line field, grows as the text wraps, and scrolls
// once it hits the CSS max-height.
function autoGrowComposer() {
  const ta = els.reactText;
  const max = parseFloat(getComputedStyle(ta).maxHeight) || 140;
  ta.style.height = 'auto';               // measure the natural content height
  const h = ta.scrollHeight;
  ta.style.height = h + 'px';             // CSS max-height clamps the grown box
  ta.classList.toggle('grown', h > max + 1);
}

function updateControls() {
  // Nothing here is disabled on purpose. The sheet can only be reached by
  // pressing React, so what the user wants is never in doubt — every action
  // explains what is missing with a toast instead of greying out. Two things
  // still carry state: Export (there must be something to export), and the mic
  // when this browser has no speech recognition at all, set once by initSTT().
  els.btnExport.disabled = state.reactions.length === 0;
  if (els.btnExport.disabled) closeExportMenu();
  if (state.pending) {
    els.reactHint.textContent = `Reacting at ¶ ${state.pending.markerP + 1} — the text is covered, so recall it from memory. ✕ brings it back.`;
  } else if (state.busyEval) {
    els.reactHint.textContent = 'Evaluating your reaction…';
  } else {
    els.reactHint.textContent = 'Click a paragraph to set your spot, then press "React" to write from memory.';
  }
}

function wireComposer() {
  els.reactText.addEventListener('input', autoGrowComposer);
  els.reactText.addEventListener('input', updateControls);
  els.reactText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.btnSend.click(); }
  });
}
