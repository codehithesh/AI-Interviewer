// ============================================================
// EXPORT — the session, generated and downloaded in the browser
// ============================================================
// Everything here is serialised from the in-memory state (§12). Nothing is
// uploaded, nothing is stored, and there is no server to ask: the file is built in
// this tab and handed straight to the browser's downloader.
//
// What a session file carries (§13): the configuration that was in force, the full
// transcript in order, the timestamps, the configured duration, the time actually
// elapsed, why the interview ended, the final evaluation — including the case where
// the evaluation FAILED, because "we could not score this" is part of the record —
// and the provider and model that were used.
//
// Two details are easy to get wrong and are deliberate here:
//
//   · The provider and model are read at export time from activeProvider(), which
//     is the live plumbing (§4.1's snapshot covers the interviewer's brief, not the
//     account). They are also copied onto the evaluation when it runs, because that
//     is the pair that actually scored the transcript. If the user switches provider
//     after the interview, the file records the switch AND what the score came from.
//   · There is no separate code-attachment turn to distinguish. The code editor
//     inserts a fenced block into the composer, so a candidate turn carrying code is
//     ONE answer — the Markdown export writes it out verbatim, fence and all, and
//     the JSON keeps it in the same `text`.
//
// The menu lives in the header, and export is enabled whenever the transcript holds
// at least one turn, so a live session can be saved too — not only a finished one.

'use strict';

function pad2(n) { return String(n).padStart(2, '0'); }

// HH:MM:SS from a number of seconds — the same shape as the on-screen timer, so a
// file and a screen never disagree about what "45 minutes" looks like.
function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

function isoOrNull(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

// The interview's own clock, as opposed to the wall clock. A live session has
// started but not finished, so elapsed is measured to now and finished_at is null —
// which is exactly what the state is.
function timing() {
  const startedMs = state.startedAt;
  const finishedMs = state.finishedAt || (startedMs ? Date.now() : null);
  const elapsed = startedMs && finishedMs ? (finishedMs - startedMs) / 1000 : 0;
  return {
    started_at: isoOrNull(startedMs),
    finished_at: isoOrNull(state.finishedAt),
    exported_at: new Date().toISOString(),
    configured_duration_minutes: state.config.duration,     // always a real limit
    elapsed_seconds: Math.max(0, Math.round(elapsed)),
    elapsed: formatElapsed(elapsed),
  };
}

// The evaluation as it stands. `null` means it has not run (a live session, or one
// with no answers); `ok: false` is a real outcome and is exported as the failure it
// was rather than silently dropped, so a saved session never looks better than the
// screen it came from.
function evaluationForExport() {
  const e = state.evaluation;
  if (!e || e.__pending) return null;
  if (e.ok) {
    return {
      ran: true,
      ok: true,
      provider: e.provider || null,
      model: e.model || null,
      result: {
        score: e.result.score,
        summary: e.result.summary || '',
        strengths: e.result.strengths,
        areasToImprove: e.result.areasToImprove,
      },
    };
  }
  return { ran: true, ok: false, error: e.error || 'the evaluation failed' };
}

function buildJson() {
  const prov = activeProvider();
  const t = timing();
  return {
    app: 'AI Interviewer',
    format: 'ai-interviewer/session@1',
    exported_at: t.exported_at,
    interview: {
      // The plumbing, as used. Read live, and named the same way the app names it.
      provider: state.provider,
      provider_label: prov.label,
      model: prov.model,
      // The brief, as snapshotted at [Start interview] — frozen for the session.
      config: Object.assign({}, state.config),
      view: state.view,                       // 'ready' | 'live' | 'done'
      started_at: t.started_at,
      finished_at: t.finished_at,
      configured_duration_minutes: t.configured_duration_minutes,
      elapsed_seconds: t.elapsed_seconds,
      elapsed: t.elapsed,
      ended_reason: state.endedReason,        // 'end' | 'timer' | 'question_cap' | null
      questions_asked: state.questionNumber,
    },
    evaluation: evaluationForExport(),
    // In order, and nothing else: a candidate turn carrying a fence is one answer,
    // and the error turns are the record of what went wrong.
    transcript: state.transcript.map((turn) => ({
      role: turn.role,                        // 'ai' | 'user'
      kind: turn.kind,                        // 'question' | 'answer' | 'error'
      mode: turn.mode || 'text',              // 'voice' | 'text'
      text: turn.text,
      at: turn.ts,
    })),
  };
}

// Markdown carries the same information as buildJson() — one readable document
// instead of one object — so either format can be handed to the same person.
function buildMarkdown() {
  const prov = activeProvider();
  const t = timing();
  const evalOut = evaluationForExport();

  let md = '# AI Interviewer — session\n\n';
  md += `**Provider:** ${prov.label} (\`${state.provider}\`) · \`${prov.model}\`\n\n`;

  const cfg = state.config;
  md += '## Interview\n\n';
  md += `- **Role:** ${cfg.role || 'not set'}\n`;
  md += `- **Type:** ${cfg.interviewType}\n`;
  md += `- **Difficulty:** ${cfg.difficulty}\n`;
  md += `- **Duration:** ${cfg.duration} minute${cfg.duration === 1 ? '' : 's'}\n`;
  md += `- **Questions:** ${cfg.questions ? `up to ${cfg.questions}` : 'no question limit'}`;
  md += ` (asked: ${state.questionNumber})\n`;
  if (cfg.prompt) md += `- **Seed prompt:** ${cfg.prompt}\n`;
  md += '\n';

  md += '## Session\n\n';
  md += `- **Started:** ${t.started_at ? new Date(t.started_at).toLocaleString() : '—'}\n`;
  md += `- **Finished:** ${t.finished_at ? new Date(t.finished_at).toLocaleString() : '—'}\n`;
  md += `- **Elapsed:** ${t.elapsed}\n`;
  md += `- **Ended because:** ${endReasonText(state.endedReason)}\n`;
  md += `- **Exported:** ${new Date(t.exported_at).toLocaleString()}\n\n`;

  md += '## Transcript\n\n';
  if (!state.transcript.length) {
    md += '_No messages yet._\n\n';
  } else {
    for (const turn of state.transcript) {
      const who = turn.role === 'user' ? 'You' : 'AI Interviewer';
      const tag = turn.mode === 'voice' ? ' _(mic)_' : '';
      const kind = turn.kind === 'error' ? ' _(error)_' : '';
      md += `### ${who}${tag}${kind} — ${new Date(turn.ts).toLocaleString()}\n\n`;
      // An interviewer reply is already markdown and is written out exactly as it
      // arrived: blank-line-separating it, as a typed message needs, would put empty
      // lines inside a fenced code block and break the fence. A typed answer is
      // plain text — and may itself carry a fence from the code editor, which must
      // survive for the same reason — so those turns are written verbatim too. The
      // paragraph-reflow trick was only ever right for text with no blocks in it.
      md += turn.text + '\n\n';
    }
  }

  md += '## Evaluation\n\n';
  if (!evalOut) {
    md += state.answers.length
      ? '_Not run — this session was exported before it finished._\n'
      : '_Not produced — no answers were given._\n';
  } else if (evalOut.ok) {
    md += `**Overall score:** ${evalOut.result.score === null ? 'not given' : evalOut.result.score + ' / 100'}\n\n`;
    md += `**Scored by:** ${evalOut.provider} / ${evalOut.model}\n\n`;
    if (evalOut.result.summary) md += evalOut.result.summary + '\n\n';
    if (evalOut.result.strengths.length) {
      md += '**What went well**\n\n';
      evalOut.result.strengths.forEach((s) => { md += `- ${s}\n`; });
      md += '\n';
    }
    if (evalOut.result.areasToImprove.length) {
      md += '**What to work on**\n\n';
      evalOut.result.areasToImprove.forEach((s) => { md += `- ${s}\n`; });
      md += '\n';
    }
  } else {
    md += `_The evaluation could not be produced: ${evalOut.error}_\n`;
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

// The filename says which interview this is without opening it: the role if one was
// set, the time it ended, and the format.
function exportFilename(fmt) {
  const role = (state.config.role || 'interview').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'interview';
  const stamp = new Date(state.finishedAt || state.startedAt || Date.now())
    .toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `ai-interviewer-${role}-${stamp}.${fmt === 'json' ? 'json' : 'md'}`;
}

function exportSession(fmt) {
  if (!fmt || !state.transcript.length) return;
  if (fmt === 'json') {
    downloadBlob(
      new Blob([JSON.stringify(buildJson(), null, 2)], { type: 'application/json' }),
      exportFilename('json')
    );
  } else if (fmt === 'markdown') {
    downloadBlob(new Blob([buildMarkdown()], { type: 'text/markdown' }), exportFilename('markdown'));
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
