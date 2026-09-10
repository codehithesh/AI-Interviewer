// ============================================================
// CODE EDITOR POPUP
// ============================================================
// The [+] in the composer opens a plain monospace <textarea> — no CodeMirror, no
// Monaco, no CDN, nothing external (§5).
//
// It is a WRITING AID, not a message of its own. [Insert into answer] drops the
// draft into the composer as a fenced code block, appended to whatever the
// composer already holds, and leaves the caret under the closing fence so a remark
// can be typed below it. One [>] then carries prose and code as a single answer.
// That deliberately overrides §5's "sends the code as its own chat message" and
// §13's separate code attachment — see IMPL_PLAN.md, "Decisions taken during
// Phase 2", #2. The consequence is that no `kind: 'code'` turn exists anywhere:
// an answer that carries a fence is one answer, and it is already rendered, sent
// and evaluated as one.
//
// A draft survives closing: Escape, the ✕, a click on the overlay and an interview
// ending all keep it in state.codeDraft and restore it on reopen (§5), because
// losing a paragraph of code to a stray keypress is the one failure this popup
// could plausibly cause. Inserting clears it instead — the code is in the composer
// from then on, and keeping a second copy is how the two drift apart.

'use strict';

// ---------- opening and closing ----------
function openCodeEditor() {
  // The [+] is disabled in Ready and Done, where the composer is inert; this guard
  // is what keeps a stale keystroke or a programmatic call from popping the dialog
  // over a screen that could not accept its output.
  if (els.btnPlus.disabled) return;
  els.codeInput.value = state.codeDraft;
  updateCodeInsertState();
  openModal(els.codeModal);
  els.codeInput.focus();
  // The caret goes to the end of the restored draft rather than to the start, which
  // is where an empty field would leave it: reopening to carry on writing is the
  // whole point of keeping the draft.
  els.codeInput.setSelectionRange(els.codeInput.value.length, els.codeInput.value.length);
}

// Closing keeps the draft. Written to be safe to call when the popup is already
// closed — the global Escape handler and the shared overlay wiring both call it —
// so the only thing the `wasOpen` flag guards is the focus hand-back, which would
// otherwise steal the caret out of the Settings modal.
function closeCodeEditor() {
  const wasOpen = !els.codeModal.classList.contains('hidden');
  state.codeDraft = els.codeInput.value;
  closeModal(els.codeModal);
  if (wasOpen && !els.imText.disabled) els.imText.focus();
}

// ---------- inserting ----------
// A fence long enough to survive the draft: code that itself contains ``` must not
// close the block it is being wrapped in. One extra backtick per collision is the
// whole fix, and it is what CommonMark asks for.
function fenceFor(code) {
  let fence = '```';
  while (code.indexOf(fence) >= 0) fence += '`';
  return fence;
}

function updateCodeInsertState() {
  els.btnCodeInsert.disabled = !els.codeInput.value.trim();
}

// Insert, do not send. The composer is written to directly, which fires no 'input'
// event, so auto-grow and the control state are refreshed by hand afterwards.
function insertCodeDraft() {
  const code = els.codeInput.value.replace(/\s+$/, '');
  if (!code) return;
  // The popup can outlive the screen it was opened from — the countdown can expire
  // with it still on screen — and a Done interview's composer takes no input.
  if (els.imText.disabled) return;

  const fence = fenceFor(code);
  const block = fence + '\n' + code + '\n' + fence;
  const existing = els.imText.value.replace(/\s+$/, '');

  // A blank line either side, and a blank line left under the fence for the remark
  // that usually follows.
  els.imText.value = existing ? existing + '\n\n' + block + '\n\n' : block + '\n\n';

  // The code lives in the composer now; the popup gives up its copy.
  state.codeDraft = '';
  els.codeInput.value = '';
  closeModal(els.codeModal);

  autoGrowComposer();
  updateControls();
  if (!els.imText.disabled) {
    els.imText.focus();
    // The caret goes after the closing fence — onto the blank line — so typing
    // carries straight on underneath the code.
    els.imText.setSelectionRange(els.imText.value.length, els.imText.value.length);
  }
}

// ---------- wiring ----------
function initCodeEditor() {
  els.btnPlus.addEventListener('click', openCodeEditor);
  els.btnCodeInsert.addEventListener('click', insertCodeDraft);
  els.btnCodeClose.addEventListener('click', closeCodeEditor);
  // The shared overlay wiring in js/dom.js hides the modal; this second listener is
  // what also keeps the draft, which is why closeCodeEditor() is written to run
  // harmlessly a second time.
  els.codeModal.addEventListener('click', (e) => {
    if (e.target === els.codeModal) closeCodeEditor();
  });
  els.codeInput.addEventListener('input', updateCodeInsertState);
  updateCodeInsertState();
}
