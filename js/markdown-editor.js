// ============================================================
// MARKDOWN EDITOR
// ============================================================
// The composer's [expand] icon opens the answer field FULL SCREEN: the same text, in
// a monospace <textarea> with a line-number gutter and a formatting toolbar. Nothing
// external is involved — no CodeMirror, no Monaco, no CDN (§5).
//
// It is not a separate message and it is not a separate draft. It is the COMPOSER
// MADE BIGGER: opening takes whatever the field already holds, every edit is written
// straight back into it, and closing hands the caret over. That is why there is no
// [Insert into answer] button — there is nothing left to insert. [>] stays the only
// way to send, and the composer is rendered as markdown when it goes (js/interview.js
// renders a candidate turn with `breaks`), so a heading written here arrives at the
// interviewer as a heading and a fence arrives as a code block. No fenced wrapper is
// added around the draft, and no markup is interpreted here: it is inserted verbatim.
//
// The toolbar is plain SOURCE editing, not a rich-text layer. Every button only
// writes markdown characters into the draft — '**' around a word, a backtick fence
// around a block, '- ' in front of a line. Nothing is rendered inside the editor, so
// what you see is exactly what is sent. The set is a convenience subset of what
// markdown.js understands (headings 1–3, emphasis, inline code, code block, quote,
// bulleted / numbered / task lists, table, rule, link, inline and display math): a
// button for syntax renderMarkdown() does not understand would be a button that
// silently does nothing on send.
//
// Three things make the field an editor rather than a stretched box:
//   · the gutter numbers every line;
//   · Tab / Shift+Tab indent and outdent instead of walking the focus ring out of the
//     field;
//   · the toolbar writes markdown over the selection.
//
// A close never loses a word: Escape, the shrink icon, a click on the overlay and an
// interview ending all leave the draft where it belongs — in the composer, because it
// was written there as it was typed.

'use strict';

// ---------- opening and closing ----------
function openMarkdownEditor() {
  // The [expand] button is disabled in Ready and Done, where the composer is inert;
  // this guard is what keeps a stale keystroke or a programmatic call from popping the
  // dialog over a screen that could not accept its output.
  if (els.btnPlus.disabled) return;
  // The editor starts as a copy of the answer, not as an empty field: it is the same
  // text, shown bigger.
  els.mdInput.value = els.imText.value;
  // The copy decides how many numbers the gutter owes, and assigning .value fires no
  // 'input' event of its own.
  renderMdGutter();
  openModal(els.mdModal);
  els.mdInput.focus();
  // The caret goes to the end, where an editor that is "the field, bigger" would
  // leave it — not at the start of a paragraph that is already half written.
  els.mdInput.setSelectionRange(els.mdInput.value.length, els.mdInput.value.length);
}

// Closing keeps the text, because the text was never held here: every keystroke has
// already been written back to the composer by syncMarkdownToComposer(). Written to
// be safe to call when the popup is already closed — the global Escape handler and the
// shared overlay wiring both call it — so the only thing the `wasOpen` flag guards is
// the focus hand-back, which would otherwise steal the caret out of the Settings modal.
function closeMarkdownEditor() {
  const wasOpen = !els.mdModal.classList.contains('hidden');
  syncMarkdownToComposer();
  closeModal(els.mdModal);
  if (wasOpen && !els.imText.disabled) els.imText.focus();
}

// ---------- the composer is the single copy ----------
// Every edit lands in the answer field immediately, so the popup can never hold a
// version of the answer the composer does not — and it cannot outlive the interview,
// because the countdown can expire while it is open and a Done screen's composer takes
// no input. Re-dispatching 'input' on the field is what keeps auto-grow and the control
// state in step (js/composer.js) without this file knowing about either; it also drops
// the `· mic` tag on a dictated answer the moment it is edited by hand, which is
// correct — a hand-edited answer is no longer the one the mic produced.
function syncMarkdownToComposer() {
  if (els.imText.value === els.mdInput.value) return;
  els.imText.value = els.mdInput.value;
  els.imText.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------- line numbers ----------
// The gutter is one text node holding "1\n2\n3…", rebuilt only when the draft's
// line count changes, and moved by transform rather than by its own scrollTop.
// Two reasons for that pair: a thousand-line paste costs one string instead of a
// thousand nodes, and a gutter that cannot scroll can never grow a scrollbar or
// fall out of step when a long line scrolls sideways under the textarea.
//
// Each logical line is exactly one visual row, which is what makes counting
// newlines enough to number them: .md-input is white-space: pre, so lines do not
// wrap. The two elements also share a font-size and line-height in styles.css, so
// row N of the numbers sits on row N of the text.
function renderMdGutter() {
  const value = els.mdInput.value;
  let lines = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) lines++;   // '\n', without splitting a string
  }
  let text = '1';
  for (let i = 2; i <= lines; i++) text += '\n' + i;
  if (els.mdGutter.textContent !== text) els.mdGutter.textContent = text;
  syncMdGutterScroll();
}

function syncMdGutterScroll() {
  els.mdGutter.style.transform = 'translateY(' + (-els.mdInput.scrollTop) + 'px)';
}

// ---------- writing into the field ----------
// Tab and the toolbar both come through here, so every edit shares one property:
// execCommand is the one way to change a textarea that leaves the browser's own undo
// stack intact, so a stray Tab — or a toolbar button pressed by mistake — is still one
// Ctrl+Z away. It is deprecated but implemented everywhere, and the direct write is the
// fallback for anywhere it is not.
function replaceMdRange(start, end, text, selStart, selEnd) {
  const ta = els.mdInput;
  let ok = false;
  ta.setSelectionRange(start, end);
  try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }
  if (!ok) {
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    // A direct write fires no 'input' event, and the gutter and the composer sync both
    // depend on one.
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(selStart, selEnd);
  renderMdGutter();
}

// ---------- Tab and Shift+Tab ----------
// The keys that make this a code-shaped field rather than a plain box: without them Tab
// moves focus out and the draft can only be indented by hand. The indent is a real tab
// character, drawn at the 2-column tab-size styles.css sets.
const MD_INDENT = '\t';
const MD_TAB_SIZE = 2;

// One line, with its indentation removed: a tab if it has one, otherwise up to one
// tab-stop of spaces. Handling both means a draft pasted from anywhere — tabs or
// spaces — still outdents rather than sitting there.
function stripMdIndent(line) {
  if (line.charAt(0) === '\t') return line.slice(1);
  let n = 0;
  while (n < MD_TAB_SIZE && line.charAt(n) === ' ') n++;
  return line.slice(n);
}

// The lines a selection touches, as offsets into the value. A selection that stops at
// the very start of a line does not drag that line in — the rule every editor uses, and
// the one that makes Shift+Tab over a block leave the line below it alone. The toolbar's
// line actions (headings, quotes, lists) work on exactly this range.
function mdLineRange(value, start, end) {
  let last = end;
  if (last > start && value.charAt(last - 1) === '\n') last--;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', last);
  if (to === -1) to = value.length;
  return { from: from, to: to };
}

// Rewrites the selected lines with `next`, keeping the selection useful: a caret stays
// on the same character (following its line left or right by however much the prefix
// changed), and a block stays selected so repeated presses keep working on it. A no-op
// returns early rather than spending an undo step.
function replaceMdLines(value, start, end, lines, next) {
  const range = mdLineRange(value, start, end);
  const before = lines.join('\n');
  const block = next.join('\n');
  if (block === before) return;
  if (start === end) {
    const delta = next[0].length - lines[0].length;
    const caret = Math.max(range.from, start + delta);
    replaceMdRange(range.from, range.to, block, caret, caret);
  } else {
    replaceMdRange(range.from, range.to, block, range.from, range.from + block.length);
  }
}

function indentMdSelection(outdent) {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  // A caret with no outdent asked for is the simple case: drop one indent in where
  // it stands. Everything below is about whole lines.
  if (!outdent && start === end) {
    const caret = start + MD_INDENT.length;
    replaceMdRange(start, start, MD_INDENT, caret, caret);
    return;
  }

  const range = mdLineRange(value, start, end);
  const lines = value.slice(range.from, range.to).split('\n');
  // A blank line is left blank, so indenting a block never litters it with trailing
  // whitespace.
  const next = lines.map((line) => {
    if (!outdent) return line ? MD_INDENT + line : line;
    return stripMdIndent(line);
  });
  // Nothing to remove — the line was already flush left. Leaving the value alone is
  // what keeps this from spending an undo step on a no-op. Checked before the caret
  // branch below for exactly that reason: that path writes unconditionally.
  if (next.join('\n') === lines.join('\n')) return;

  if (start === end) {
    // A caret outdenting its own line: it stays on the same character, which means
    // following the line left by however much indentation came off.
    const removed = lines[0].length - next[0].length;
    const caret = Math.max(range.from, start - removed);
    replaceMdRange(range.from, range.to, next.join('\n'), caret, caret);
    return;
  }
  replaceMdLines(value, start, end, lines, next);
}

// ---------- the formatting toolbar ----------
// Every action is a pure text edit: it writes markdown characters over the selection
// and nothing else. Nothing here parses the draft, and nothing renders — so the field
// always shows the exact source that will be sent.

// Wraps the selection in a marker pair, or takes the markers back off when they are
// already there. The "already there" test looks in both places the pair can sit: around
// the selection ('**bold**' selected without the stars) and inside it ('**bold**'
// selected whole), so the button toggles the way an editor's does rather than nesting
// '******'. With an empty selection the placeholder is inserted and left selected, so
// the first keystroke replaces it.
function mdToggleWrap(before, after, placeholder) {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const inner = value.slice(start, end);

  // The pair sits just outside the selection.
  if (start >= before.length && value.slice(start - before.length, start) === before
      && value.slice(end, end + after.length) === after) {
    const from = start - before.length;
    const to = end + after.length;
    replaceMdRange(from, to, inner, from, from + inner.length);
    return;
  }
  // The pair is part of the selection.
  if (inner.length >= before.length + after.length
      && inner.slice(0, before.length) === before
      && inner.slice(inner.length - after.length) === after) {
    const text = inner.slice(before.length, inner.length - after.length);
    replaceMdRange(start, end, text, start, start + text.length);
    return;
  }

  const body = inner || placeholder;
  const text = before + body + after;
  const bodyStart = start + before.length;
  replaceMdRange(start, end, text, bodyStart, bodyStart + body.length);
}

// '- ', '1. ' or '> ' in front of every line the selection touches, removed again if
// every line already carries it. A blank line INSIDE a block is left blank so a list
// never grows trailing whitespace.
function mdToggleLinePrefix(prefix) {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const range = mdLineRange(value, start, end);
  const lines = value.slice(range.from, range.to).split('\n');

  // A caret on an empty line with nothing to toggle: the marker goes down so the item
  // can be typed straight after it. This is the case the editor opens in — a blank
  // answer — and returning the line unchanged there made every list button look dead.
  if (start === end && !lines[0].trim() && !lines[0].startsWith(prefix)) {
    const caret = start + prefix.length;
    replaceMdRange(start, start, prefix, caret, caret);
    return;
  }

  // A blank line counts as carrying the prefix only when it actually does, so pressing
  // the button again on an empty item takes the marker back off instead of doing nothing.
  const marked = lines.filter((line) => line.trim() || line.startsWith(prefix));
  const allOn = marked.length > 0 && marked.every((line) => line.startsWith(prefix));
  const next = lines.map((line) => {
    if (allOn) return line.startsWith(prefix) ? line.slice(prefix.length) : line;
    if (!line.trim()) return line;
    return line.startsWith(prefix) ? line : prefix + line;
  });
  replaceMdLines(value, start, end, lines, next);
}

// '# ' … '###### ' on every line the selection touches. An existing heading marker of
// any level is replaced rather than stacked, and pressing the level a line already has
// turns it back into a paragraph.
function mdHeading(level) {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const range = mdLineRange(value, start, end);
  const lines = value.slice(range.from, range.to).split('\n');
  const marker = new Array(level + 1).join('#') + ' ';

  // A caret on an empty line, with nothing to toggle — same case as the lists above.
  if (start === end && !lines[0].trim() && !lines[0].startsWith(marker)) {
    const caret = start + marker.length;
    replaceMdRange(start, start, marker, caret, caret);
    return;
  }

  const marked = lines.filter((line) => line.trim() || line.startsWith(marker));
  const allOn = marked.length > 0 && marked.every((line) => line.startsWith(marker));
  const next = lines.map((line) => {
    // The heading marker, not a '#' that happens to start the line: a line of prose
    // beginning '#hashtag' is left as it is.
    const bare = line.replace(/^#{1,6}[ \t]+/, '');
    if (!line.trim()) return allOn && line.startsWith(marker) ? bare : line;
    return allOn ? bare : marker + bare;
  });
  replaceMdLines(value, start, end, lines, next);
}

// Drops a multi-line block into the draft on its own lines, with a blank line between
// it and whatever it was inserted next to — a table or a rule welded to the paragraph
// above it is a block the renderer would swallow. An optional selection (offsets into
// `block`) is left selected so a placeholder can be typed straight over.
function insertMdBlock(block, selFrom, selTo) {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before.trim() ? (before.charAt(before.length - 1) === '\n' ? '\n' : '\n\n') : '';
  const tail = after.trim() ? (after.charAt(0) === '\n' ? '\n' : '\n\n') : '';
  const base = start + lead.length;
  const text = lead + block + tail;
  if (selFrom == null) replaceMdRange(start, end, text, base + block.length, base + block.length);
  else replaceMdRange(start, end, text, base + selFrom, base + selTo);
}

// A fence long enough to survive the block: code that itself contains ``` must not
// close the block early. One extra backtick per collision is the whole fix, and it is
// what CommonMark asks for.
function fenceFor(code) {
  let fence = '```';
  while (code.indexOf(fence) >= 0) fence += '`';
  return fence;
}

function mdCodeBlock() {
  const ta = els.mdInput;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const inner = ta.value.slice(start, end);
  const fence = fenceFor(inner);
  const body = inner || 'code';
  // A fence only opens a block at the start of a line, so a mid-line insertion starts
  // one of its own rather than fencing the tail of the paragraph.
  const lead = start > 0 && ta.value.charAt(start - 1) !== '\n' ? '\n' : '';
  const text = lead + fence + '\n' + body + '\n' + fence;
  const bodyStart = start + lead.length + fence.length + 1;
  replaceMdRange(start, end, text, bodyStart, bodyStart + body.length);
}

function mdTable() {
  const block = '| Column 1 | Column 2 | Column 3 |\n'
    + '| --- | --- | --- |\n'
    + '| Cell | Cell | Cell |';
  insertMdBlock(block, 2, 10);          // 'Column 1' left selected
}

function mdRule() {
  insertMdBlock('---');
}

function mdMathBlock() {
  const body = 'x = 1';
  insertMdBlock('$$\n' + body + '\n$$', 3, 3 + body.length);
}

// '[label](url)': the selection becomes the label, and the placeholder URL is left
// selected so it can be typed over without reaching for the mouse.
function mdLink() {
  const ta = els.mdInput;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const label = value.slice(start, end) || 'link text';
  const text = '[' + label + '](url)';
  // '[' + label + '](' is what precedes the placeholder URL.
  const urlStart = start + label.length + 3;
  replaceMdRange(start, end, text, urlStart, urlStart + 3);
}

// The whole toolbar, as a table rather than a chain of ifs, so the button set and the
// keyboard shortcuts below stay one list. Each action is pure source editing.
const MD_ACTIONS = {
  bold: () => mdToggleWrap('**', '**', 'bold text'),
  italic: () => mdToggleWrap('*', '*', 'italic text'),
  strike: () => mdToggleWrap('~~', '~~', 'struck text'),
  code: () => mdToggleWrap('`', '`', 'code'),
  link: () => mdLink(),
  h1: () => mdHeading(1),
  h2: () => mdHeading(2),
  h3: () => mdHeading(3),
  quote: () => mdToggleLinePrefix('> '),
  codeblock: () => mdCodeBlock(),
  ul: () => mdToggleLinePrefix('- '),
  ol: () => mdToggleLinePrefix('1. '),
  task: () => mdToggleLinePrefix('- [ ] '),
  table: () => mdTable(),
  hr: () => mdRule(),
  math: () => mdToggleWrap('$', '$', 'x'),
  mathblock: () => mdMathBlock(),
};

function onMdKeydown(e) {
  // The four shortcuts every markdown field has. Ctrl/Cmd only — Shift is left alone so
  // Cmd+Shift+B and friends stay the browser's, and Alt is excluded because AltGr is how
  // some layouts type the very characters this is inserting.
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const key = e.key.toLowerCase();
    const action = key === 'b' ? 'bold' : key === 'i' ? 'italic'
      : key === 'e' ? 'code' : key === 'k' ? 'link' : null;
    if (action) {
      e.preventDefault();
      MD_ACTIONS[action]();
      return;
    }
  }
  // Tab only. Shift+Tab arrives here as Tab with shiftKey set, which is exactly the
  // outdent case. Ctrl/Cmd/Alt combinations are left to the browser.
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  // Without this the browser walks the focus ring — the bug this whole section is here
  // to fix. Tab must never leave the field.
  e.preventDefault();
  indentMdSelection(e.shiftKey);
}

// ---------- wiring ----------
function initMarkdownEditor() {
  els.btnPlus.addEventListener('click', openMarkdownEditor);
  els.btnMdClose.addEventListener('click', closeMarkdownEditor);
  // The shared overlay wiring in js/dom.js hides the modal; this second listener is what
  // also hands focus back, which is why closeMarkdownEditor() is written to run
  // harmlessly a second time.
  els.mdModal.addEventListener('click', (e) => {
    if (e.target === els.mdModal) closeMarkdownEditor();
  });

  // A toolbar button must not take the selection with it. Cancelling the mousedown keeps
  // focus — and so the selection — in the textarea, which is why the action can operate
  // on what the user highlighted. The click still fires normally; a keyboard activation
  // never goes through mousedown, and the focus() at the end of the click handler brings
  // the caret back after one.
  els.mdToolbar.addEventListener('mousedown', (e) => e.preventDefault());
  els.mdToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.md-tool') : null;
    if (!btn) return;
    const action = MD_ACTIONS[btn.dataset.md];
    if (action) action();
    els.mdInput.focus();
  });

  els.mdInput.addEventListener('keydown', onMdKeydown);
  els.mdInput.addEventListener('input', () => {
    renderMdGutter();
    syncMarkdownToComposer();
  });
  // The numbers follow the text up and down, and only up and down: a long line scrolling
  // sideways must not take them with it.
  els.mdInput.addEventListener('scroll', syncMdGutterScroll);
  renderMdGutter();
}
