// ============================================================
// EXPORT — generated & downloaded in-browser
// ============================================================
// The session is serialised from the in-memory state only; nothing is uploaded and
// nothing is stored. The dropdown lives in the screen header, and it is enabled
// whenever the transcript holds at least one turn — so a live session can be saved
// too, not only a finished one.
//
// Phase 5 replaces this with the full §13 shape (configuration in force, elapsed
// time, endedReason, evaluation, provider/model actually used). What is here now
// already exports the new turn shape: role + kind + mode + text.

'use strict';

function buildJson() {
  const prov = activeProvider();
  return {
    app: 'AI Interviewer',
    exported_at: new Date().toISOString(),
    interview: {
      provider: state.provider,
      model: prov.model,
      config: Object.assign({}, state.config),
      view: state.view,
      started_at: state.startedAt ? new Date(state.startedAt).toISOString() : null,
      finished_at: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
      ended_reason: state.endedReason,
    },
    messages: state.transcript.map((t) => ({
      role: t.role,
      kind: t.kind,
      mode: t.mode || 'text',
      text: t.text,
      at: t.ts,
    })),
  };
}

// Markdown carries the same information as buildJson() — one document instead of
// one object — so either format can be handed to the same reader.
function buildMarkdown() {
  const prov = activeProvider();
  let md = '# AI Interviewer — conversation\n\n';
  md += `**Provider:** ${state.provider} / ${prov.model}\n\n`;
  md += `**Exported:** ${new Date().toISOString()}\n\n---\n\n`;

  if (!state.transcript.length) return md + '_No messages yet._\n';

  for (const t of state.transcript) {
    const who = t.role === 'user' ? 'You' : 'AI';
    const tag = t.mode === 'voice' ? ' _(mic)_' : '';
    md += `### ${who}${tag} — ${new Date(t.ts).toLocaleString()}\n\n`;
    // A reply is already markdown, so it is written out exactly as it arrived:
    // blank-line-separating it, as a typed message needs, would put empty lines
    // inside a fenced code block and break the fence. An interviewer turn is
    // `kind: 'question'`; 'text' is still honoured for the older turn shape. A
    // typed message is plain text, where markdown collapses a bare newline into a
    // space, so those are still blank-line-separated to keep the author's breaks.
    const isMarkdown = t.role === 'ai' && (t.kind === 'question' || t.kind === 'text');
    md += (isMarkdown ? t.text : t.text.split('\n').join('\n\n')) + '\n\n';
  }
  return md;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSession(fmt) {
  if (!fmt || !state.transcript.length) return;
  const base = `ai-interviewer-chat-${Date.now()}`;
  if (fmt === 'json') {
    downloadBlob(
      new Blob([JSON.stringify(buildJson(), null, 2)], { type: 'application/json' }),
      base + '.json'
    );
  } else if (fmt === 'markdown') {
    downloadBlob(new Blob([buildMarkdown()], { type: 'text/markdown' }), base + '.md');
  }
}

function openExportMenu() {
  if (els.btnExport.disabled) return;
  els.exportMenu.classList.remove('hidden');
  els.btnExport.setAttribute('aria-expanded', 'true');
}

function closeExportMenu() {
  els.exportMenu.classList.add('hidden');
  els.btnExport.setAttribute('aria-expanded', 'false');
}

// ---------- wiring ----------
function wireExport() {
  els.btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.exportMenu.classList.contains('hidden')) openExportMenu(); else closeExportMenu();
  });
  els.exportMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    closeExportMenu();
    exportSession(item.dataset.format);
  });
  document.addEventListener('click', (e) => {
    if (!els.exportMenu.classList.contains('hidden') && !e.target.closest('.menu-wrap')) closeExportMenu();
  });
}
