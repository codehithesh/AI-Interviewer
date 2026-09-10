// ============================================================
// READER — the reading pane
// ============================================================
// Owns the text once it has arrived: splitting it into paragraphs, rendering
// them, and responding to a paragraph click.
//
// It does not acquire text. Every way a source arrives — the modal's paste tab,
// the modal's URL tab, a toolbar click — lives in js/source.js and ends by
// calling loadSource() below. This file is the single entry point for showing a
// source, and the single place the reading pane is drawn.

'use strict';

function loadSource(text, title, url) {
  stopTTS();
  state.sourceTitle = title || '';
  state.sourceUrl = url || '';
  state.paras = segmentText(text);
  state.totalChars = text.length;
  state.markerP = -1;
  state.pending = null;
  state.voiceTyped = false;
  els.reactText.value = '';

  state.prefixLen = [];
  let acc = 0;
  for (const p of state.paras) { acc += p.text.length + 2; state.prefixLen.push(acc); }

  renderReading();
  const who = state.sourceTitle && state.sourceTitle !== 'Pasted text' ? `“${state.sourceTitle}”` : 'text';
  setStatus(`Loaded ${who}: ${state.paras.length} paragraphs, ${fmtCount(state.totalChars)} chars`, 'success');
  updateReadPos();
  updateControls();
}

function segmentText(text) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  // Preserve the author's structure: every line break starts a new paragraph,
  // so single-newline-separated paragraphs are never merged into one wall of text.
  const lines = clean.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (line.length <= 2200) { out.push({ text: line }); continue; }
    // Exceptionally long single-line paragraphs are split at sentence boundaries
    // so marking and read-aloud stay reliable.
    const sentences = line.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [line];
    let cur = '';
    for (const s of sentences) {
      const piece = s.trim();
      if (!piece) continue;
      if ((cur + ' ' + piece).length > 1600 && cur) { out.push({ text: cur }); cur = piece; }
      else cur = cur ? cur + ' ' + piece : piece;
    }
    if (cur) out.push({ text: cur });
  }
  return out.length ? out : [{ text: clean }];
}

// ---------- reading pane ----------
function renderReading() {
  els.reading.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.paras.forEach((p, i) => {
    const el = document.createElement('p');
    el.className = 'para';
    el.dataset.p = String(i);
    el.textContent = p.text;
    frag.appendChild(el);
  });
  els.reading.appendChild(frag);
}

// ---------- wiring ----------
function wireReader() {
  els.reading.addEventListener('click', (e) => {
    const pEl = e.target.closest('p.para');
    if (!pEl) return;
    stopTTS();
    setMarker(parseInt(pEl.dataset.p, 10));
  });
}
