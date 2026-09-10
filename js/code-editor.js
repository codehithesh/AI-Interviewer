// ============================================================
// CODE EDITOR POPUP
// ============================================================
// The [+] in the composer opens a monospace <textarea> with a line-number gutter —
// no CodeMirror, no Monaco, no CDN, nothing external (§5). Those two are what stop
// it being a plain box: the gutter numbers the draft, and Tab / Shift+Tab indent it
// instead of walking the focus ring out of the field. Anything beyond that (syntax
// colouring, find, multiple files) would mean a real editor and a dependency.
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
  // The restored draft decides how many numbers the gutter owes, and assigning
  // .value fires no 'input' event of its own.
  renderCodeGutter();
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
  renderCodeGutter();
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

// ---------- line numbers ----------
// The gutter is one text node holding "1\n2\n3…", rebuilt only when the draft's
// line count changes, and moved by transform rather than by its own scrollTop.
// Two reasons for that pair: a thousand-line paste costs one string instead of a
// thousand nodes, and a gutter that cannot scroll can never grow a scrollbar or
// fall out of step when a long line scrolls sideways under the textarea.
//
// Each logical line is exactly one visual row, which is what makes counting
// newlines enough to number them: .code-input is white-space: pre, so lines do not
// wrap. The two elements also share a font-size and line-height in styles.css, so
// row N of the numbers sits on row N of the code.
function renderCodeGutter() {
  const value = els.codeInput.value;
  let lines = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) lines++;   // '\n', without splitting a string
  }
  let text = '1';
  for (let i = 2; i <= lines; i++) text += '\n' + i;
  if (els.codeGutter.textContent !== text) els.codeGutter.textContent = text;
  syncCodeGutterScroll();
}

function syncCodeGutterScroll() {
  els.codeGutter.style.transform = 'translateY(' + (-els.codeInput.scrollTop) + 'px)';
}

// ---------- Tab and Shift+Tab ----------
// The keys that make this a code field rather than a plain box: without them Tab
// moves focus out and the draft can only be indented by hand. The indent is a real
// tab character, drawn at the 2-column tab-size styles.css sets.
const CODE_INDENT = '\t';
const CODE_TAB_SIZE = 2;

// Writes text over a range and then puts the selection where the caller wants it.
// execCommand is the point of this function: it is the one way to change a textarea
// that leaves the browser's own undo stack intact, so a stray Tab is still one
// Ctrl+Z away. It is deprecated but implemented everywhere, and the direct write is
// the fallback for anywhere it is not.
function replaceCodeRange(start, end, text, selStart, selEnd) {
  const ta = els.codeInput;
  let ok = false;
  ta.setSelectionRange(start, end);
  try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }
  if (!ok) {
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    // A direct write fires no 'input' event, and auto-grow and the [Insert into
    // answer] state both depend on one.
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(selStart, selEnd);
  renderCodeGutter();
}

// One line, with its indentation removed: a tab if it has one, otherwise up to one
// tab-stop of spaces. Handling both means a draft pasted from anywhere — tabs or
// spaces — still outdents rather than sitting there.
function stripCodeIndent(line) {
  if (line.charAt(0) === '\t') return line.slice(1);
  let n = 0;
  while (n < CODE_TAB_SIZE && line.charAt(n) === ' ') n++;
  return line.slice(n);
}

function indentCodeSelection(outdent) {
  const ta = els.codeInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  // A caret with no outdent asked for is the simple case: drop one indent in where
  // it stands. Everything below is about whole lines.
  if (!outdent && start === end) {
    const caret = start + CODE_INDENT.length;
    replaceCodeRange(start, start, CODE_INDENT, caret, caret);
    return;
  }

  // The lines the selection touches. A selection that stops at the very start of a
  // line does not drag that line in — the rule every editor uses, and the one that
  // makes Shift+Tab over a block leave the line below it alone.
  let last = end;
  if (last > start && value.charAt(last - 1) === '\n') last--;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', last);
  if (to === -1) to = value.length;

  const lines = value.slice(from, to).split('\n');
  // A blank line is left blank, so indenting a block never litters it with trailing
  // whitespace.
  const next = lines.map((line) => {
    if (!outdent) return line ? CODE_INDENT + line : line;
    return stripCodeIndent(line);
  });
  const block = next.join('\n');
  // Nothing to remove — the line was already flush left. Leaving the value alone is
  // what keeps this from spending an undo step on a no-op.
  if (block === lines.join('\n')) return;

  if (start === end) {
    // A caret outdenting its own line: it stays on the same character, which means
    // following the line left by however much indentation came off.
    const removed = lines[0].length - next[0].length;
    const caret = Math.max(from, start - removed);
    replaceCodeRange(from, to, block, caret, caret);
  } else {
    // Keep the block selected, so repeated Tab presses keep working on it.
    replaceCodeRange(from, to, block, from, from + block.length);
  }
}

function onCodeKeydown(e) {
  // Tab only. Shift+Tab arrives here as Tab with shiftKey set, which is exactly the
  // outdent case. Ctrl/Cmd/Alt combinations are left to the browser.
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  // Without this the browser walks the focus ring — the bug this whole section is
  // here to fix. Tab must never leave the field.
  e.preventDefault();
  indentCodeSelection(e.shiftKey);
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
  els.codeInput.addEventListener('keydown', onCodeKeydown);
  els.codeInput.addEventListener('input', () => {
    renderCodeGutter();
    updateCodeInsertState();
  });
  // The numbers follow the code up and down, and only up and down: a long line
  // scrolling sideways must not take them with it.
  els.codeInput.addEventListener('scroll', syncCodeGutterScroll);
  renderCodeGutter();
  updateCodeInsertState();
}
