// ============================================================
// EXPORT — generated & downloaded in-browser
// ============================================================
// The session is serialised from the in-memory state only; nothing is uploaded
// and nothing is stored. The dropdown lives in the reactions sheet header.

'use strict';

function buildJson() {
  const prov = activeProvider();
  return {
    app: 'Reaction Learner',
    exported_at: new Date().toISOString(),
    evaluator: { provider: state.provider, model: prov.model },
    source: {
      title: state.sourceTitle || 'Pasted text',
      url: state.sourceUrl,
      chars: state.totalChars,
      paragraphs: state.paras.length,
      text: state.paras.map((p) => p.text).join('\n\n'),
    },
    reactions: state.reactions.map((r) => {
      const ev = state.evals.find((e) => e.reactionId === r.id);
      return {
        id: r.id,
        text: r.text,
        mode: r.mode,
        at_paragraph: r.atParagraph,
        reacted_at: r.ts,
        slice_chars: r.sliceChars,
        slice_truncated: r.truncated,
        slice_text: r.sliceText,
        evaluation: ev
          ? (ev.ok ? { provider: ev.provider, model: ev.model, ...ev.result } : { error: ev.error })
          : null,
      };
    }),
  };
}

// Markdown carries the same information as buildJson(): the source text the
// session was built on, the context each reaction was scored against, and the
// evaluation itself. Only the shape differs — one document per session instead
// of one object — so either format can be handed to the same reader.
function buildMarkdown() {
  const prov = activeProvider();
  const sourceText = state.paras.map((p) => p.text).join('\n\n');

  let md = '# Reaction Learner Session\n\n';
  md += `**Source:** ${state.sourceTitle || 'Pasted text'}\n\n`;
  if (state.sourceUrl) md += `**URL:** ${state.sourceUrl}\n\n`;
  md += `**Size:** ${fmtCount(state.totalChars)} chars, ${state.paras.length} paragraphs\n\n`;
  md += `**Evaluator:** ${state.provider} / ${prov.model}\n\n`;
  md += `**Exported:** ${new Date().toISOString()}\n\n---\n\n`;

  // the text that was grabbed — the JSON export's source.text. Source first,
  // mirroring the JSON, so the two exports can be read side by side.
  md += `## Source text\n\n${sourceText || '_(no source text loaded)_'}\n\n---\n\n`;
  md += `## Reactions\n\n`;

  state.reactions.forEach((r, i) => {
    const ev = state.evals.find((e) => e.reactionId === r.id);
    md += `### Reaction ${i + 1} — ¶ ${r.atParagraph + 1} (${r.mode}) — ${new Date(r.ts).toLocaleString()}\n\n`;
    // the JSON's slice_chars / slice_truncated, stated up front
    md += `*Context scored: ¶ 1–${r.atParagraph + 1} · ${fmtCount(r.sliceChars)} chars${r.truncated ? ' · truncated to the context budget' : ''}*\n\n`;
    // quote every line: a reaction can be several lines from the composer, and
    // an unprefixed continuation line would fall out of the blockquote
    md += r.text.split('\n').map((line) => '> ' + line).join('\n') + '\n\n';

    if (ev && ev.ok) {
      // per-evaluation provider, not the global line above: the provider can be
      // switched mid-session, so each reaction records the one that scored it
      md += `**Evaluation — via ${ev.providerLabel || ev.provider} ${ev.model}**\n\n`;
      for (const [key, label] of DIM_LABELS) {
        const d = ev.result[key];
        if (d) md += `- **${label}:** ${d.score}/100 — ${d.explanation || ''}\n`;
      }
      if (ev.result.suggested_better_summary) {
        md += `\n**Suggested better summary:** ${ev.result.suggested_better_summary}\n`;
      }
      md += '\n';
    } else if (ev) {
      md += `_Evaluation failed: ${ev.error}_\n\n`;
    } else {
      md += `_Not evaluated._\n\n`;  // JSON writes evaluation: null here
    }

    // the exact slice that was scored — the JSON export's slice_text
    md += `#### Source slice scored\n\n${r.sliceText}\n\n`;
  });

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
  if (!fmt || !state.reactions.length) return;
  const base = `reaction-learner-${slug(state.sourceTitle)}-${Date.now()}`;
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
