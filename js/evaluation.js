// ============================================================
// EVALUATION — build the scoring prompt, run it, render the result
// ============================================================
// The network call itself lives in js/api.js; this file owns the rubric, the
// prompt and the DOM the scores are rendered into.

'use strict';

const DIM_LABELS = [
  ['accuracy', 'Accuracy'],
  ['understanding', 'Understanding'],
  ['coverage', 'Coverage'],
  ['unsupported_inference', 'Unsupported inference'],
  ['incorrect_claims', 'Incorrect claims'],
  ['missed_points', 'Missed points'],
  ['overall_score', 'Overall'],
];

const DIM_GUIDES = [
  ['accuracy', 'does the reaction correctly reflect the source?'],
  ['understanding', 'genuine comprehension vs mere repetition?'],
  ['coverage', 'does it cover the key points of the slice?'],
  ['unsupported_inference', 'claims not backed by the source (low score = many)'],
  ['incorrect_claims', 'statements wrong vs the source (low score = many)'],
  ['missed_points', 'important ideas omitted (low score = many)'],
  ['overall_score', 'single overall quality number'],
];

async function runEvaluation(reaction, prov) {
  state.busyEval = true;
  updateControls();

  const card = document.createElement('div');
  card.className = 'bubble ai';
  const head0 = document.createElement('div');
  head0.className = 'bubble-header';
  head0.textContent = 'Evaluation';
  const wait = document.createElement('div');
  const sp = document.createElement('span');
  sp.className = 'loader';
  wait.appendChild(sp);
  wait.appendChild(document.createTextNode(
    `Scoring with ${prov.label} (${prov.model})…`
  ));
  card.appendChild(head0);
  card.appendChild(wait);
  els.reactions.appendChild(card);
  scrollBottom(els.reactions);

  try {
    const schemaRows = DIM_GUIDES.map(([k]) => `  "${k}": {"score": 0-100, "explanation": "one sentence"}`).join(',\n');
    const schema = `{\n${schemaRows},\n  "suggested_better_summary": "concise accurate summary of the slice the learner should have produced"\n}`;

    const sliceIntro = reaction.truncated
      ? `Source text (last ${fmtCount(MAX_SLICE_CHARS)} chars before your marker — earlier text omitted):`
      : 'Source text (through the paragraph the learner reacted at):';

    const systemPrompt =
      'You are a strict but fair tutor. A learner reacted to a text passage. Compare their reaction against the source text and score it. Return ONLY valid JSON matching the requested schema — no markdown fences, no commentary, no extra text.';
    const userPrompt = `${sliceIntro}
---
${reaction.sliceText}
---
${reaction.sliceNote ? '\n' + reaction.sliceNote + '\n' : ''}
Learner's reaction:
---
${reaction.text}
---
Score every dimension on a 0-100 integer scale, higher is better, with a one-sentence explanation:
${DIM_GUIDES.map(([k, g]) => `- ${k}: ${g}`).join('\n')}
Then "suggested_better_summary": write the concise summary the learner should have been able to produce.

Return JSON exactly like:
${schema}`;

    const out = await callChat(prov, prov.model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    const parsed = parseJsonLoose(out.text);
    const record = {
      reactionId: reaction.id,
      provider: prov.name,
      providerLabel: prov.label,
      model: prov.model,
      ok: true,
      result: parsed,
      raw: out.text,
    };
    state.evals.push(record);
    card.innerHTML = '';
    card.appendChild(buildEvalDOM(record, reaction));
    setStatus('Evaluation complete', 'success');
  } catch (err) {
    state.evals.push({
      reactionId: reaction.id,
      provider: prov.name,
      providerLabel: prov.label,
      model: prov.model,
      ok: false,
      error: err.message || String(err),
    });
    card.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'bubble-header';
    h.textContent = 'Evaluation failed';
    const m = document.createElement('div');
    m.style.color = 'var(--error)';
    m.textContent = err.message || String(err);
    card.appendChild(h);
    card.appendChild(m);
    setStatus('Evaluation failed: ' + (err.message || err), 'error');
  } finally {
    state.busyEval = false;
    updateControls();
  }
}

function buildEvalDOM(record, reaction) {
  const wrap = document.createElement('div');

  const head = document.createElement('div');
  head.className = 'bubble-header';
  head.textContent = `Evaluation — via ${record.providerLabel || record.provider} ${record.model}`;
  wrap.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'eval-grid';
  const res = record.result || {};
  for (const [key, label] of DIM_LABELS) {
    const d = res[key];
    if (!d) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(d.score) || 0)));
    const cls = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
    const cell = document.createElement('div');
    cell.className = 'eval-cell';
    const name = document.createElement('div');
    name.className = 'name';
    name.appendChild(document.createTextNode(label));
    const badge = document.createElement('span');
    badge.className = 'score-badge ' + cls;
    badge.textContent = score + '/100';
    name.appendChild(badge);
    const exp = document.createElement('div');
    exp.className = 'exp';
    exp.textContent = d.explanation || '';
    cell.appendChild(name);
    cell.appendChild(exp);
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  if (res.suggested_better_summary) {
    const box = document.createElement('div');
    box.className = 'summary-box';
    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = 'Suggested better summary';
    const body = document.createElement('div');
    body.textContent = res.suggested_better_summary;
    box.appendChild(lab);
    box.appendChild(body);
    wrap.appendChild(box);
  }

  const meta = document.createElement('div');
  meta.className = 'dim-row';
  meta.textContent =
    `Context: ¶ 0–${reaction.atParagraph + 1} · ${fmtCount(reaction.sliceChars)} chars` +
    (reaction.truncated ? ' (truncated)' : '');
  wrap.appendChild(meta);
  return wrap;
}
