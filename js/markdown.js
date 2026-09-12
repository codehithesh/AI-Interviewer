// ============================================================
// MARKDOWN — replies rendered as formatted text
// ============================================================
// Models answer in markdown, and a good interview answer is exactly the shape that
// needs it: headings, numbered steps, a comparison table, a fenced snippet. Shown
// as plain text all of that arrives as literal "###", "**" and a wall of pipes, so
// replies are parsed into real elements here.
//
// This is the only place in the app that turns model output into markup, so the
// pipeline is escape-first, and every step is ordered around that:
//
//   1 · block structure is found on the raw lines — '#', '>' and '|' still mean
//       something, and escaping first would destroy them;
//   2 · each construct that must not be re-read — code spans and blocks, links — is
//       lifted out into a stash and replaced by a NUL placeholder, so the rules
//       that run afterwards cannot see inside it;
//   3 · text is HTML-escaped as it is emitted, and only then do the inline rules
//       run — they can therefore only ever produce the tags written in this file.
//
// So a reply containing <img src=x onerror=alert(1)> renders as those visible
// characters and never as an element. Nothing here may be relaxed to save a step:
// the input is whatever a model, or a page that talked to a model, decided to send.
//
// Images are deliberately not rendered, only linked. A bubble that fetched
// ![](https://host/pixel.png) would tell that host the reply had been read, and
// this app's whole claim is that the conversation goes nowhere but the provider.

'use strict';

// ---------- placeholders ----------
// A placeholder is NUL + index + NUL. mdClean() strips NUL from the input, so a
// placeholder can only ever be one this file put there.
function mdStash() {
  const items = [];
  return {
    add(html) {
      items.push(html);
      return '\u0000' + (items.length - 1) + '\u0000';
    },
    // Restored in a single pass. Restoring repeatedly would let a value that merely
    // looks like a placeholder ("\u00000\u0000" typed by a model) expand into
    // whatever happens to sit at that index.
    flush(s) {
      return s.replace(/\u0000(\d+)\u0000/g, (m, n) => {
        const v = items[Number(n)];
        return v === undefined ? '' : v;
      });
    },
  };
}

const MD_PLACEHOLDER = /^\u0000\d+\u0000$/;

// & first, or the entities this very call adds would be escaped a second time.
// The single quote is left alone: every attribute this file writes is
// double-quoted, and '"' is escaped.
function mdEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Everything a model sends passes through here before any rule looks at it. NUL is
// the placeholder alphabet and must not be forgeable; the rest of the C0 range is
// noise no renderer should carry into the DOM. Tab and newline survive — they carry
// meaning.
function mdClean(src) {
  return String(src == null ? '' : src)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

// ---------- urls ----------
// Only schemes that cannot execute. A model writing javascript: or data: inside a
// link is attempting script injection with a friendly face, and this is the check
// that stops it — a link is built from this return value, or not at all. It is
// handed the already-escaped URL, which is what an href attribute wants anyway.
function mdUrl(url) {
  const u = String(url == null ? '' : url).replace(/[\u0000-\u0020\u007F]/g, '');
  if (!/^https?:\/\//i.test(u) && !/^mailto:/i.test(u)) return null;
  return u;
}

// ---------- code ----------
function mdCodeBlock(info, body, closed) {
  // the info string is a language name; nothing outside [\w+#.-] can survive it, so
  // it cannot close the attribute it lands in
  const lang = String(info).trim().split(/[ \t]+/)[0].replace(/[^\w+#.-]/g, '').slice(0, 24);
  const cls = lang ? ' class="language-' + lang + '"' : '';
  return '<pre><code' + cls + '>' + mdEscape(body.join('\n')) + (closed ? '' : '\n') + '</code></pre>';
}

// Fenced and indented code is lifted out before any block rule sees it: inside a
// fence, '#' and '-' and '|' are characters, not structure.
function mdExtractBlocks(lines, stash) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const fence = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/.exec(lines[i]);
    if (fence) {
      const mark = fence[1][0];
      const len = fence[1].length;
      const close = new RegExp('^ {0,3}' + (mark === '`' ? '`' : '~') + '{' + len + ',}[ \\t]*$');
      const body = [];
      let closed = false;
      i += 1;
      while (i < lines.length) {
        if (close.test(lines[i])) { closed = true; i += 1; break; }
        body.push(lines[i]);
        i += 1;
      }
      // An unclosed fence runs to the end of the message, which is what a reader
      // expects of a block that was never terminated — not a stray line of
      // backticks followed by prose.
      out.push(stash.add(mdCodeBlock(fence[2], body, closed)));
      continue;
    }

    // Display math is lifted out like a fence, and for the same reason: it may run
    // across several lines, and inside it '\', '^' and '{' belong to the TeX rather
    // than to the block rules. An inline pair is deliberately left alone here, so a
    // '$…$' sitting inside a paragraph still reaches mdInline(). A '\[…\]' block is
    // left to mdInline() as well, because only there can it be told apart from a
    // display equation that merely shares a line with prose.
    let asMath = false;
    for (const [open, close] of MD_MATH_FENCES) {
      const m = open.exec(lines[i]);
      if (!m) continue;
      // The closer usually shares the opening line — '$$x$$' — and only sometimes
      // sits on a line of its own.
      const same = new RegExp('^(.*?)' + close + '$').exec(m[1]);
      const body = same ? [same[1]] : [m[1]];
      let j = i + 1;
      let closed = !!same;
      if (!same) {
        const end = new RegExp(close + '$');
        while (j < lines.length && !end.test(lines[j])) { body.push(lines[j]); j += 1; }
        if (j < lines.length) {
          body.push(lines[j].replace(end, ''));
          closed = true;
          j += 1;
        }
      }
      const html = closed ? mdMathBlock(body.join('\n')) : null;
      if (html) { out.push(stash.add(html)); i = j; asMath = true; }
      else {
        // Not math after all — hand the lines back so the delimiters render as typed.
        for (const l of body) out.push(l);
        i = closed ? j : lines.length;
        asMath = true;
      }
      break;
    }
    if (asMath) continue;

    // Four columns of indent is a code block — but only where it starts one. An
    // indented code block cannot interrupt a paragraph, and that rule is what keeps
    // an indented continuation inside a list item from being read as code.
    if (/^(?: {4}|\t)/.test(lines[i]) && lines[i].trim() && (i === 0 || !lines[i - 1].trim())) {
      const body = [];
      while (i < lines.length && lines[i].trim() && /^(?: {4}|\t)/.test(lines[i])) {
        body.push(lines[i].replace(/^(?: {4}|\t)/, ''));
        i += 1;
      }
      out.push(stash.add(mdCodeBlock('', body, true)));
      continue;
    }

    out.push(lines[i]);
    i += 1;
  }
  return out;
}

// ---------- math ----------
// A model answering an interview question reaches for LaTeX constantly — $O(n \log n)$,
// $\frac{n}{2}$, $\sum_{i=1}^{n}$. Some of that is notation the prose cannot carry.
//
// This is a deliberately small converter, not a TeX engine: no dependency is worth
// adding to a page that must run from file://, and a third-party parser fed model
// output is a much larger surface than the few constructs a reply actually uses.
// Anything it does not know is emitted as escaped text, so an unsupported command
// shows up as itself rather than vanishing.
//
// Like the rest of this file it is escape-first: mdEscape() runs over every fragment
// before a tag is written around it, and only the tags below are ever produced.
const MD_MATH_SYMBOLS = {
  // lower-case greek
  alpha: '&alpha;', beta: '&beta;', gamma: '&gamma;', delta: '&delta;',
  epsilon: '&epsilon;', varepsilon: '&epsilon;', zeta: '&zeta;', eta: '&eta;',
  theta: '&theta;', vartheta: '&theta;', iota: '&iota;', kappa: '&kappa;',
  lambda: '&lambda;', mu: '&mu;', nu: '&nu;', xi: '&xi;', pi: '&pi;', varpi: '&pi;',
  rho: '&rho;', sigma: '&sigma;', tau: '&tau;', upsilon: '&upsilon;',
  phi: '&phi;', varphi: '&phi;', chi: '&chi;', psi: '&psi;', omega: '&omega;',
  // upper-case greek
  Gamma: '&Gamma;', Delta: '&Delta;', Theta: '&Theta;', Lambda: '&Lambda;',
  Xi: '&Xi;', Pi: '&Pi;', Sigma: '&Sigma;', Upsilon: '&Upsilon;',
  Phi: '&Phi;', Psi: '&Psi;', Omega: '&Omega;',
  // operators and relations
  times: '&times;', div: '&divide;', cdot: '&middot;', pm: '&plusmn;', mp: '&mnplus;',
  le: '&le;', leq: '&le;', ge: '&ge;', geq: '&ge;', ne: '&ne;', neq: '&ne;',
  approx: '&asymp;', equiv: '&equiv;', sim: '&sim;', propto: '&prop;',
  in: '&isin;', notin: '&notin;', subset: '&sub;', subseteq: '&sube;',
  supset: '&sup;', supseteq: '&supe;', cup: '&cup;', cap: '&cap;',
  forall: '&forall;', exists: '&exist;', nabla: '&nabla;', partial: '&part;',
  infty: '&infin;', infinity: '&infin;', cdots: '&ctdot;', dots: '&ctdot;',
  ldots: '&ctdot;', vdots: '&vellip;', quad: '&nbsp;&nbsp;', qquad: '&nbsp;&nbsp;&nbsp;&nbsp;',
  to: '&rarr;', rightarrow: '&rarr;', Rightarrow: '&rArr;', leftarrow: '&larr;',
  Leftarrow: '&lArr;', leftrightarrow: '&harr;', mapsto: '&mapsto;',
  land: '&and;', wedge: '&and;', lor: '&or;', vee: '&or;', neg: '&not;', lnot: '&not;',
  // shapes and delimiters
  sqrt: '&radic;', sum: '&sum;', prod: '&prod;', int: '&int;',
  angle: '&ang;', perp: '&perp;', parallel: '&parallel;', therefore: '&there4;',
  degree: '&deg;', circ: '&compfn;', star: '&star;', ast: '&lowast;',
  prime: '&prime;', ell: '&ell;', hbar: '&hbar;', Re: '&real;', Im: '&image;',
  // relations and delimiters a proof or a complexity argument reaches for
  ll: '&lt;&lt;', gg: '&gt;&gt;', cong: '&cong;', simeq: '&cong;', ni: '&ni;',
  emptyset: '&empty;', varnothing: '&empty;', setminus: '&#8726;', backslash: '&#8726;',
  oplus: '&oplus;', otimes: '&otimes;', odot: '&odot;', bullet: '&bull;',
  because: '&because;', implies: '&rArr;', iff: '&hArr;', mid: '&#8739;',
  langle: '&lang;', rangle: '&rang;', lceil: '&lceil;', rceil: '&rceil;',
  lfloor: '&lfloor;', rfloor: '&rfloor;', vert: '&#8739;', Vert: '&#8214;',
};

// Commands that print nothing of their own: 'left' and 'right' are only size hints,
// so they are dropped and the delimiter they wrapped is left standing.
const MD_MATH_NOOP = new Set(['left', 'right', 'displaystyle', 'textstyle', 'limits', 'nolimits']);

// Operators print upright, as a name rather than as a product of variables, and each
// is a single atom so a limit can attach to it: \lim_{n \to \infty}. Without this
// '\log' and '\lim' fell through to the unknown-command rule and printed their own
// backslash.
const MD_MATH_OPS = new Set([
  'log', 'ln', 'lg', 'exp', 'lim', 'limsup', 'liminf', 'sin', 'cos', 'tan', 'cot',
  'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth', 'arcsin', 'arccos', 'arctan',
  'min', 'max', 'gcd', 'lcm', 'mod', 'bmod', 'sup', 'inf', 'arg', 'det', 'dim',
  'deg', 'ker', 'hom', 'Pr', 'tr', 'rank', 'span', 'diag',
]);

// An accent wraps its argument in a span; the CSS draws the mark from a glyph or a
// text decoration, so nothing has to be embedded. A bare '\bar x' takes one token.
const MD_MATH_ACCENTS = {
  vec: 'md-vec', overrightarrow: 'md-vec', overleftarrow: 'md-vec',
  bar: 'md-over', overline: 'md-over', underline: 'md-under',
  hat: 'md-hat', widehat: 'md-hat', tilde: 'md-tilde', widetilde: 'md-tilde',
  dot: 'md-dot', ddot: 'md-ddot',
};

// Blackboard bold has real characters for the sets a reply actually names, so
// \mathbb{R} is an ℝ and not a bold R.
const MD_MATH_BB = {
  R: '&#8477;', N: '&#8469;', Z: '&#8484;', Q: '&#8474;', C: '&#8450;',
  P: '&#8473;', H: '&#8461;', E: '&#8496;', F: '&#8497;', D: '&#8517;',
};

// \begin{env} … \end{env}. Every variant is the same grid with different delimiters,
// which is exactly how TeX treats them, so the only per-environment data is the pair
// of delimiters and whether '&' columns align left/right (aligned) or centre (matrix).
const MD_MATH_ENVS = {
  matrix: { open: '', close: '' },
  smallmatrix: { open: '', close: '' },
  array: { open: '', close: '' },
  gather: { open: '', close: '' },
  gathered: { open: '', close: '' },
  pmatrix: { open: '(', close: ')' },
  bmatrix: { open: '[', close: ']' },
  Bmatrix: { open: '{', close: '}' },
  vmatrix: { open: '|', close: '|' },
  Vmatrix: { open: '&#8214;', close: '&#8214;' },
  cases: { open: '{', close: '' },
  aligned: { open: '', close: '', align: true },
  align: { open: '', close: '', align: true },
  alignedat: { open: '', close: '', align: true },
  split: { open: '', close: '', align: true },
  eqnarray: { open: '', close: '', align: true },
};
// Wrappers that only group an equation; the body is the formula unchanged.
const MD_MATH_TRANSPARENT = new Set([
  'equation', 'equation*', 'displaymath', 'math', 'multline', 'multline*',
]);


// How a display equation is opened and closed. '$$' is what a model writes; '\[ … \]'
// is the other spelling, and it shares the converter.
const MD_MATH_FENCES = [
  [/^ {0,3}\$\$(.*)$/, '\\$\\$'],
  [/^ {0,3}\\\[(.*)$/, '\\\\\\]'],
];

function mdMunch(src, i) {
  // A script at the very end of a formula — '$x^$' — asks for a token that is not
  // there. Handing back an empty one keeps the caller on the literal-character path
  // instead of recursing on undefined.
  if (i >= src.length) return { tex: '', end: src.length };
  if (src[i] === '{') {
    let depth = 0;
    for (let j = i; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (!depth) return { tex: src.slice(i + 1, j), end: j + 1 };
      }
    }
    return { tex: src.slice(i + 1) };   // an unclosed group runs to the end
  }
  // A single token: a command name, or one character.
  if (src[i] === '\\') {
    const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
    return m ? { tex: m[0], end: i + m[0].length } : { tex: '', end: i + 1 };
  }
  return { tex: src[i], end: i + 1 };
}

function mdMathGroup(inner, tag) {
  const h = inner == null ? '' : mdMath(inner);
  if (!h) return '';
  return '<' + tag + '>' + h + '</' + tag + '>';
}

// Rows are split on '\\' and cells on '&', both scanned by hand so a '\&' stays in
// the cell it was written in. An empty row — a trailing break, a stray '\hline' —
// is dropped rather than drawn as a blank line.
function mdSplitRows(body) {
  const parts = [];
  let cur = '';
  for (let k = 0; k < body.length; k += 1) {
    if (body[k] === '\\' && body[k + 1] === '\\') { parts.push(cur); cur = ''; k += 1; }
    else cur += body[k];
  }
  parts.push(cur);
  return parts;
}

function mdSplitCells(row) {
  const parts = [];
  let cur = '';
  for (let k = 0; k < row.length; k += 1) {
    if (row[k] === '\\' && row[k + 1] === '&') { cur += '&'; k += 1; }
    else if (row[k] === '&') { parts.push(cur); cur = ''; }
    else cur += row[k];
  }
  parts.push(cur);
  return parts.map((c) => c.trim());
}

function mdMathEnvironment(env, body) {
  const spec = MD_MATH_ENVS[env];
  if (!spec) return null;
  const rows = mdSplitRows(body.replace(/\\hline/g, ''))
    .map(mdSplitCells)
    .filter((cells) => cells.some((c) => c.length));
  if (!rows.length) return null;
  let html = '<span class="md-matrix' + (spec.align ? ' md-matrix-align' : '') + '">';
  for (const cells of rows) {
    html += '<span class="md-mrow">'
      + cells.map((c) => '<span class="md-mcell">' + mdMath(c) + '</span>').join('')
      + '</span>';
  }
  html += '</span>';
  if (spec.open) html = '<span class="md-delim">' + spec.open + '</span>' + html;
  if (spec.close) html += '<span class="md-delim">' + spec.close + '</span>';
  return html;
}

// The font-changing commands. Only blackboard bold and bold have a rendering worth
// promising; the script and fraktur faces have no font here, so their letters stand
// as written rather than being faked.
function mdMathStyled(name, tex) {
  const inner = mdMath(tex);
  if (name === 'mathbb') return MD_MATH_BB[tex.trim()] || '<span class="md-bb">' + inner + '</span>';
  if (name === 'mathbf' || name === 'boldsymbol' || name === 'bm') return '<strong>' + inner + '</strong>';
  if (name === 'mathsf') return '<span class="md-sans">' + inner + '</span>';
  if (name === 'mathtt') return '<span class="md-mono">' + inner + '</span>';
  return inner;
}

function mdMath(src) {
  let out = '';
  let plain = '';
  // Where a '^' or '_' attaches. It is set to the end of every base atom, and moves
  // forward as each script is added, so a_i^2 becomes a<sub>i</sub><sup>2</sup>
  // instead of the exponent nesting inside the subscript — which is what
  // \sum_{i=1}^{n} used to render as.
  let scriptAt = -1;
  let i = 0;
  const flush = () => {
    if (plain) { out += mdEscape(plain); plain = ''; scriptAt = out.length; }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === '^' || ch === '_') {
      const g = mdMunch(src, i + 1);
      const body = mdMathGroup(g.tex, ch === '^' ? 'sup' : 'sub');
      if (body) {
        flush();
        if (scriptAt < 0 || scriptAt > out.length) scriptAt = out.length;
        out = out.slice(0, scriptAt) + body + out.slice(scriptAt);
        scriptAt += body.length;
        i = g.end === undefined ? src.length : g.end;
        continue;
      }
    }

    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      const name = m ? m[1] : '';
      const end = i + (m ? m[0].length : 1);

      // A whole environment is one block, so it is consumed here rather than left to
      // the per-character rules — inside it, '&' and '\\' belong to the grid.
      if (name === 'begin') {
        const em = /^\{([^}]*)\}/.exec(src.slice(end));
        const env = em ? em[1].trim() : '';
        if (em && (MD_MATH_ENVS[env] || MD_MATH_TRANSPARENT.has(env))) {
          let bodyAt = end + em[0].length;
          if (env === 'array' && src[bodyAt] === '{') {        // {lcr} column spec
            const cb = src.indexOf('}', bodyAt);
            if (cb > -1) bodyAt = cb + 1;
          }
          const endTag = '\\end{' + env + '}';
          const closeAt = src.indexOf(endTag, bodyAt);
          if (closeAt > -1) {
            flush();
            const inner = src.slice(bodyAt, closeAt);
            const html = MD_MATH_ENVS[env] ? mdMathEnvironment(env, inner) : mdMath(inner.trim());
            if (html) {
              out += html;
              scriptAt = out.length;
              i = closeAt + endTag.length;
              continue;
            }
          }
        }
      }

      if (MD_MATH_NOOP.has(name)) { i = end; continue; }

      if (MD_MATH_OPS.has(name)) {
        flush();
        out += name;                       // letters only, safe without escaping
        scriptAt = out.length;
        i = end;
        continue;
      }

      if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
        const a = mdMunch(src, end);
        const b = mdMunch(src, a.end === undefined ? src.length : a.end);
        flush();
        out += '<span class="md-frac"><span class="md-num">' + mdMathGroup(a.tex, 'span')
          + '</span><span class="md-den">' + mdMathGroup(b.tex, 'span') + '</span></span>';
        scriptAt = out.length;
        i = b.end === undefined ? src.length : b.end;
        continue;
      }

      if (name === 'binom' || name === 'dbinom' || name === 'tbinom' || name === 'choose') {
        const a = mdMunch(src, end);
        const b = mdMunch(src, a.end === undefined ? src.length : a.end);
        flush();
        out += '<span class="md-binom"><span class="md-frac"><span class="md-num">'
          + mdMathGroup(a.tex, 'span') + '</span><span class="md-den">'
          + mdMathGroup(b.tex, 'span') + '</span></span></span>';
        scriptAt = out.length;
        i = b.end === undefined ? src.length : b.end;
        continue;
      }

      if (name === 'sqrt') {
        // \sqrt[3]{x}: an optional root degree, which for a cube root is worth keeping
        let deg = null;
        let j = end;
        if (src[j] === '[') {
          const close = src.indexOf(']', j);
          if (close > -1) { deg = src.slice(j + 1, close); j = close + 1; }
        }
        const g = mdMunch(src, j);
        flush();
        out += '<span class="md-sqrt">' + (deg ? '<sup>' + mdMathGroup(deg, 'span') + '</sup>' : '')
          + '&radic;<span class="md-radicand">' + mdMathGroup(g.tex, 'span') + '</span></span>';
        scriptAt = out.length;
        i = g.end === undefined ? src.length : g.end;
        continue;
      }

      if (MD_MATH_ACCENTS[name]) {
        const g = mdMunch(src, end);
        flush();
        out += '<span class="' + MD_MATH_ACCENTS[name] + '">' + mdMath(g.tex) + '</span>';
        scriptAt = out.length;
        i = g.end === undefined ? src.length : g.end;
        continue;
      }

      if (name === 'mathbb' || name === 'mathbf' || name === 'boldsymbol' || name === 'bm'
        || name === 'mathcal' || name === 'mathfrak' || name === 'mathsf' || name === 'mathtt') {
        const g = mdMunch(src, end);
        flush();
        out += mdMathStyled(name, g.tex);
        scriptAt = out.length;
        i = g.end === undefined ? src.length : g.end;
        continue;
      }

      if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'mbox') {
        const g = mdMunch(src, end);
        plain += g.tex;                        // prose inside math: kept as written
        i = g.end === undefined ? src.length : g.end;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(MD_MATH_SYMBOLS, name)) {
        flush();
        out += MD_MATH_SYMBOLS[name];
        scriptAt = out.length;
        i = end;
        continue;
      }

      // '\%' '\&' '\#' print their character; '\,', '\;' and '\!' are spacing; '\\'
      // outside an environment is a break with nowhere to break. All of them are one
      // character, and none of them should print the backslash.
      if (name.length === 1 && !/[a-zA-Z]/.test(name)) {
        plain += '%&#_{}$'.indexOf(name) > -1 ? name : ' ';
        i = end;
        continue;
      }

      // An unknown command is shown as itself rather than dropped.
      plain += m ? m[0] : '\\';
      i = end;
      continue;
    }

    plain += ch;
    i += 1;
  }

  flush();
  return out;
}

// Which '$…$' pairs are math. The awkward case is the dollar sign as currency: in
// "the first costs $5 and the second costs $10" the pair spans prose. TeX almost
// never contains an English word, so a span holding one — longer than a variable
// name, or one of the joining words — is read as money and left alone. The shapes a
// reply actually uses, $O(n)$ and $O(n \log n)$ and $n^2$ and $\frac{n}{2}$, all pass.
const MD_MATH_FUNCS = new Set([
  'log', 'ln', 'exp', 'lim', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'min', 'max', 'gcd', 'lcm', 'mod', 'sup', 'inf', 'arg', 'det', 'dim', 'deg',
]);
// Deliberately without 'a' and without the logical connectives spelled with a
// backslash ('\lor', '\land'): a single letter is a variable name, and the command
// forms are caught by the maths-signal test below before a word is ever looked at.
// The bare English connectives are here so "costs $100 or $200" is read as money.
const MD_MATH_STOPWORDS = new Set([
  'and', 'to', 'per', 'the', 'an', 'of', 'vs', 'but', 'with', 'from', 'than',
  'or', 'not', 'is', 'are', 'was', 'were', 'be', 'been', 'if', 'then', 'else',
  'for', 'by', 'on', 'at', 'it', 'as', 'so', 'do', 'does', 'did', 'in', 'we',
]);

function mdLooksLikeMath(s) {
  const t = s.trim();
  if (!t || t.length > 2000) return false;
  // A command, a script, a group or a relation is a signal a price never carries.
  // This is what lets '$\text{speed}$' and '$distance = rate \times time$' render
  // even though they contain English words — the words alone used to veto them.
  // A lone trailing '\' is not a command: 'costs \$5 and \$10' must stay money.
  if (/\\[a-zA-Z%&#_{}$,;:!|]/.test(t)) return true;
  if (/[_^{}=]/.test(t)) return true;
  // A price pair — '$5 and $10' — has whitespace on both sides of the inner '$'.
  if (/\s\$\s/.test(s)) return false;
  for (const w of t.match(/[A-Za-z]+/g) || []) {
    // one letter is a variable, never a stopword
    if (w.length > 1 && MD_MATH_STOPWORDS.has(w.toLowerCase())) return false;
    if (w.length > 2 && !MD_MATH_FUNCS.has(w.toLowerCase())) return false;
  }
  return /[A-Za-z]/.test(t);
}

function mdMathSpan(tex) {
  const body = mdMath(tex);
  return body ? '<span class="md-math">' + body + '</span>' : null;
}

function mdMathBlock(tex) {
  const body = mdMath(tex.trim());
  return body ? '<div class="md-math-block">' + body + '</div>' : null;
}

// ---------- inline ----------
// Runs on text that has already been escaped, and may therefore only add tags of
// its own. Placeholders pass through untouched.
function mdEmphasis(s) {
  let out = s;
  // strongest first, or '**bold**' would be eaten as '*' + '*' by the italic rule
  out = out.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  // '_' is only emphasis at a word boundary, so snake_case_identifiers survive
  out = out.replace(/(^|[^\w_])__(?=\S)([\s\S]*?\S)__([^\w_]|$)/g, '$1<strong>$2</strong>$3');
  out = out.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_([^\w_]|$)/g, '$1<em>$2</em>$3');
  out = out.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  return out;
}

function mdCodeText(s) {
  // A backslash escape means the same thing inside code as outside it: the next
  // character was meant literally. Markdown's own syntax is what it hides, and a
  // code span is literal by definition, so the delimiter goes. Anything else — a
  // regex like \d or a Windows path — is the author's text and is kept verbatim.
  return String(s).replace(/\\([\\`*_{}\[\]()#+\-.!>|~])/g, '$1');
}

function mdInline(raw, stash) {
  let s = String(raw);

  // Code spans first: what sits between backticks is literal, so the rules below
  // must not reach inside it. Stashed escaped, since it is emitted as-is.
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g,
    (m, ticks, code) => stash.add('<code>' + mdEscape(mdCodeText(code)) + '</code>'));

  // Paired math before the backslash rule, or the '\(' and '\[' of a delimiter would
  // be claimed as a literal escape and the pair could never be recognised.
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, tex) => {
    const html = mdMathSpan(tex);
    return html === null ? m : stash.add(html);
  });

  // A '$$…$$' or '\[…\]' block that reaches here was not alone on its lines, so it is
  // still a display equation — just one sharing its paragraph with prose.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => {
    const html = mdMathBlock(tex);
    return html === null ? m : stash.add(html);
  });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, tex) => {
    const html = mdMathBlock(tex);
    return html === null ? m : stash.add(html);
  });

  // A backslash escape is the model asking for a literal character; lifting it into
  // the stash before the escaping step is what keeps '\*' from becoming emphasis.
  // Single-character escapes only, so '\(' above is not touched.
  s = s.replace(/\\([\\`*_\[\]#+\-.!>|~])/g, (m, ch) => stash.add(mdEscape(ch)));

  // Inline math, before the escaping step so the TeX is still intact. A pair that
  // does not look like math — a price, a lone dollar — is left exactly as typed.
  s = s.replace(/\$([^$\n]+)\$/g, (m, tex) => {
    if (!mdLooksLikeMath(tex)) return m;
    const html = mdMathSpan(tex);
    return html === null ? m : stash.add(html);
  });

  // From here on the text is inert: no '<' can reach the DOM except the ones this
  // file writes.
  s = mdEscape(s);

  // Links. An image is rendered as a link to itself rather than fetched — see the
  // file header. A URL this file will not vouch for is left visible as typed.
  const anchor = (href, text) =>
    stash.add('<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + text + '</a>');
  s = s.replace(/!?\[([^\]]*)\]\(\s*([^\s()]+)[^)]*\)/g, (m, label, url) => {
    const href = mdUrl(url);
    if (!href) return m;
    return anchor(href, label ? mdEmphasis(label) : href);
  });

  // Bare URLs, with the sentence's punctuation left outside the link.
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (m, pre, url) => {
    let bare = url;
    let tail = '';
    for (;;) {
      const ch = bare.slice(-1);
      if (!'.,;:!?)]'.includes(ch)) break;
      // A ';' here may be closing an escaped character ('&gt;'), and an entity cut
      // in half would show up in the link as its own source text.
      if (ch === ';' && /&[a-zA-Z]*$|&#\d*$/.test(bare.slice(0, -1))) break;
      bare = bare.slice(0, -1);
      tail = ch + tail;
    }
    const href = mdUrl(bare);
    if (!href) return m;
    return pre + anchor(href, bare) + tail;
  });

  s = mdEmphasis(s);

  // A hard break is two trailing spaces or a backslash at the end of a line. A soft
  // one is just a newline, which CSS collapses to a space — standard markdown.
  s = s.replace(/ {2,}\n/g, '<br>\n').replace(/\\\n/g, '<br>\n');
  return s;
}

// ---------- tables ----------
const MD_PIPE = '\u0001';   // a cell's own '\|', set aside so it cannot split one

function mdRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  // The escape is restored as a bare '|' — that is the character the author wrote.
  // Leaving the backslash in would both print it in the cell and, inside a code
  // span, survive the code-span rule below as a literal '\|'.
  return s.replace(/\\\|/g, MD_PIPE).split('|')
    .map((c) => c.trim().replace(new RegExp(MD_PIPE, 'g'), '|'));
}

function mdTableDelim(line) {
  if (line.indexOf('-') < 0) return false;
  return /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(line);
}

function mdAlign(delim) {
  return mdRow(delim).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function mdTable(head, rows, align, stash) {
  const pad = (cells) => {
    const c = cells.slice(0, align.length);
    while (c.length < align.length) c.push('');
    return c;
  };
  const cell = (text, i, tag) => {
    const a = align[i];
    // inline style from a fixed set of three words — nothing a model wrote
    const style = a ? ' style="text-align:' + a + '"' : '';
    return '<' + tag + style + '>' + mdInline(text, stash) + '</' + tag + '>';
  };
  let html = '<div class="table-wrap"><table><thead><tr>';
  html += pad(head).map((c, i) => cell(c, i, 'th')).join('');
  html += '</tr></thead><tbody>';
  for (const r of rows) html += '<tr>' + pad(r).map((c, i) => cell(c, i, 'td')).join('') + '</tr>';
  return html + '</tbody></table></div>';
}

// ---------- lists ----------
const MD_ITEM = /^( *)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;

function mdIndent(line) { return line.length - line.replace(/^ +/, '').length; }

function mdStrip(line, col) {
  let n = 0;
  while (n < col && line[n] === ' ') n += 1;
  return line.slice(n);
}

// A heading, quote, rule or extracted block cannot be a lazy continuation of a list
// item's paragraph — it ends the list instead.
function mdStartsBlock(line) {
  const t = line.trim();
  return MD_PLACEHOLDER.test(t)
    || /^ {0,3}#{1,6}[ \t]/.test(line)
    || /^ {0,3}>/.test(line)
    || /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/.test(line);
}

// Collects one run of items. Each item keeps its own sub-lines with its content
// column stripped, so a nested list or a second paragraph inside an item is handed
// back to mdBlocks() as ordinary blocks and nests where the indentation says.
function mdList(lines, start, stash) {
  const first = MD_ITEM.exec(lines[start]);
  const base = first[1].length;
  const ordered = /^\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const m = MD_ITEM.exec(lines[i]);

    if (m && m[1].length <= base) {
      if (m[1].length < base) break;              // belongs to an enclosing list
      // A different marker kind starts a different list. Without this a numbered
      // list directly after a bullet list was swallowed as more bullets.
      if (/^\d/.test(m[2]) !== ordered) break;
      items.push({ lines: [m[4]], col: m[1].length + m[2].length + m[3].length, loose: false });
      i += 1;
      continue;
    }

    const cur = items[items.length - 1];
    if (!cur) break;

    if (!lines[i].trim()) {
      // A blank line only ends the list if nothing indented follows it.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      if (j >= lines.length) { i = j; break; }
      const nm = MD_ITEM.exec(lines[j]);
      const ind = nm ? nm[1].length : mdIndent(lines[j]);
      // Item, or content indented into one, keeps the list alive across the blank
      // line — that is what makes it a loose list rather than two lists.
      if (!(ind >= cur.col || (nm && ind >= base))) { i = j; break; }
      cur.loose = true;                           // a blank line makes the item loose
      cur.lines.push('');
      i = j;
      continue;
    }

    if (mdIndent(lines[i]) < cur.col && mdStartsBlock(lines[i])) break;
    cur.lines.push(mdStrip(lines[i], cur.col));
    i += 1;
  }

  const tag = ordered ? 'ol' : 'ul';
  const attr = ordered && startNum !== 1 ? ' start="' + startNum + '"' : '';
  // Loose is a property of the list, not of an item: one blank line anywhere and
  // every item gets its paragraph wrapper, or the items would not line up.
  const loose = items.some((it) => it.loose);

  // A GitHub task list — '- [x] done' — turns a study plan into something the reader
  // can actually tick off, so the box is a real control: mdCheckboxHandler() flips it
  // and nothing is stored, exactly like the transcript itself.
  let tasks = false;
  const body = items.map((it) => {
    let inner = mdBlocks(it.lines, stash);
    // A tight item is just its text. Only the first paragraph is unwrapped, so a
    // nested list still follows the words rather than being swallowed by them.
    if (!loose && inner.startsWith('<p>')) {
      const end = inner.indexOf('</p>');
      if (end > -1) inner = inner.slice(3, end) + inner.slice(end + 4);
    }
    const box = /^\[([ xX])\][ \t]+/.exec(inner);
    if (box) {
      tasks = true;
      const on = box[1].toLowerCase() === 'x';
      inner = '<span class="md-check' + (on ? ' on' : '') + '" role="checkbox" tabindex="0"'
        + ' aria-checked="' + on + '" aria-label="Task ' + (on ? 'done' : 'not done') + '">'
        + '</span>' + inner.slice(box[0].length);
    }
    return '<li>' + inner + '</li>';
  }).join('');

  return {
    html: '<' + tag + attr + (tasks ? ' class="md-tasks"' : '') + '>' + body + '</' + tag + '>',
    next: i,
  };
}

// ---------- blocks ----------
function mdBlocks(lines, stash) {
  const out = [];
  let para = [];
  let i = 0;

  const flush = () => {
    if (!para.length) return;
    out.push('<p>' + mdInline(para.join('\n'), stash) + '</p>');
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { flush(); i += 1; continue; }

    const mathLine = /^ {0,3}((?:\$\$|\\\[).*(?:\$\$|\\\])|\\\(.*\\\))[ \t]*$/.exec(line);
    if (mathLine) { flush(); out.push('<p>' + mdInline(mathLine[1], stash) + '</p>'); i += 1; continue; }

    // An extracted code block is a block on its own line.
    if (MD_PLACEHOLDER.test(line.trim())) { flush(); out.push(line.trim()); i += 1; continue; }

    // Setext underline — only a heading when there is a paragraph above it to
    // underline; otherwise it is a horizontal rule.
    const setext = para.length && /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (setext) {
      const tag = setext[1][0] === '=' ? 'h1' : 'h2';
      const text = para.join('\n');
      para = [];
      out.push('<' + tag + '>' + mdInline(text, stash) + '</' + tag + '>');
      i += 1;
      continue;
    }

    if (/^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/.test(line)) { flush(); out.push('<hr>'); i += 1; continue; }

    const atx = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(line);
    if (atx) {
      flush();
      const n = atx[1].length;
      out.push('<h' + n + '>' + mdInline(atx[2], stash) + '</h' + n + '>');
      i += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      flush();
      const inner = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
        i += 1;
      }
      out.push('<blockquote>' + mdBlocks(inner, stash) + '</blockquote>');
      continue;
    }

    // A table is a row with pipes followed by a delimiter row of the same width; the
    // width check is what keeps "a | b" over "---" from becoming a one-column table
    // where the author meant a paragraph and a rule.
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && mdTableDelim(lines[i + 1])) {
      const head = mdRow(line);
      const align = mdAlign(lines[i + 1]);
      if (head.length === align.length) {
        flush();
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
          rows.push(mdRow(lines[i]));
          i += 1;
        }
        out.push(mdTable(head, rows, align, stash));
        continue;
      }
    }

    if (MD_ITEM.test(line)) {
      flush();
      const list = mdList(lines, i, stash);
      out.push(list.html);
      i = list.next;
      continue;
    }

    para.push(line);
    i += 1;
  }

  flush();
  return out.join('');
}

// ---------- entry points ----------
// Returns an HTML string. Safe to assign because every character that came from the
// model was escaped before any tag was written around it.
function renderMarkdown(src) {
  const stash = mdStash();
  const lines = mdExtractBlocks(mdClean(src).split('\n'), stash);
  return stash.flush(mdBlocks(lines, stash));
}

// A task box is the one rendered element the reader is meant to touch, so its state
// is toggled here. Delegated from the document, once, and only ever reads or writes
// its own attributes — nothing from the reply is used to find anything.
let mdChecksWired = false;
function mdCheckboxHandler(e) {
  const box = e.target && e.target.closest ? e.target.closest('.md-check') : null;
  if (!box) return;
  const on = !box.classList.contains('on');
  box.classList.toggle('on', on);
  box.setAttribute('aria-checked', String(on));
  box.setAttribute('aria-label', on ? 'Task done' : 'Task not done');
}

function wireMarkdown() {
  if (mdChecksWired) return;
  mdChecksWired = true;
  document.addEventListener('click', mdCheckboxHandler);
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target && e.target.classList
      && e.target.classList.contains('md-check')) {
      e.preventDefault();                 // a space must not scroll the transcript
      mdCheckboxHandler(e);
    }
  });
}

// The chat's entry point. The innerHTML is deliberate and safe: renderMarkdown() is
// the only producer of this string, and it escapes first.
function renderMarkdownInto(el, src) {
  el.classList.add('md');
  el.innerHTML = renderMarkdown(src);
}

// A formula read out symbol by symbol is noise, so the common TeX commands become
// the words a person would say. The symbols are the same ones mdMath() knows, which
// is why they are listed as words here instead of as entities.
const MD_SPOKEN_MATH = {
  times: 'times', div: 'divided by', cdot: 'times', pm: 'plus or minus',
  le: 'less than or equal to', leq: 'less than or equal to', ge: 'greater than or equal to',
  geq: 'greater than or equal to', ne: 'not equal to', neq: 'not equal to',
  approx: 'approximately', equiv: 'equivalent to', sim: 'similar to', propto: 'proportional to',
  in: 'in', notin: 'not in', subset: 'subset of', subseteq: 'subset of',
  supset: 'superset of', supseteq: 'superset of', cup: 'union', cap: 'intersection',
  forall: 'for all', exists: 'there exists', nabla: 'nabla', partial: 'partial',
  infty: 'infinity', infinity: 'infinity', cdots: 'dot dot dot', dots: 'dot dot dot',
  ldots: 'dot dot dot', vdots: 'dot dot dot', quad: ' ', qquad: ' ',
  to: 'to', rightarrow: 'to', Rightarrow: 'implies', leftarrow: 'from',
  Leftarrow: 'implied by', leftrightarrow: 'if and only if', mapsto: 'maps to',
  land: 'and', wedge: 'and', lor: 'or', vee: 'or', neg: 'not', lnot: 'not',
  sum: 'sum of', prod: 'product of', int: 'integral of', angle: 'angle',
  perp: 'perpendicular to', parallel: 'parallel to', therefore: 'therefore',
  degree: 'degrees', circ: 'degrees', ell: 'ell', hbar: 'h bar',
  log: 'log', ln: 'natural log', exp: 'exp', lim: 'limit', sin: 'sine', cos: 'cosine',
  tan: 'tangent', min: 'minimum', max: 'maximum', gcd: 'gcd', lcm: 'lcm',
  // accents and environment commands; the braces around them are dropped below
  vec: 'vector', overline: 'bar over', bar: 'bar over', hat: 'hat over',
  tilde: 'tilde over', mathbb: '', mathbf: '', mathcal: '', mathfrak: '',
  binom: 'choose', begin: '', end: '',
};

function mdMathToPlain(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ' ');
  // fractions read left to right, the way the numerator then the denominator is said
  t = t.replace(/\\[dtc]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ');
  t = t.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, ' $1 root of $2 ');
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, ' square root of $1 ');
  t = t.replace(/\\(?:text|mathrm|operatorname|mbox)\s*\{([^{}]*)\}/g, ' $1 ');
  t = t.replace(/\\([a-zA-Z]+)/g, (m, name) => (
    Object.prototype.hasOwnProperty.call(MD_SPOKEN_MATH, name)
      ? ' ' + MD_SPOKEN_MATH[name] + ' '
      : ' ' + name + ' '          // an unknown command is said, not swallowed
  ));
  t = t.replace(/\\/g, ' ').replace(/[{}]/g, ' ').replace(/\$/g, ' ');
  // A matrix cell separator and a binomial's two arguments are punctuation, not words
  t = t.replace(/&/g, ' ');
  // a script marker is not a word: '$x^2$' is said "x 2", not "x caret 2"
  t = t.replace(/[_^]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// The same reply as speech. Markers are not words: without this the reader says
// "asterisk asterisk" and reads a URL out loud instead of the link's label. Fenced
// code is dropped — a snippet spelled out letter by letter is noise, and the words
// around it still carry the answer.
function markdownToPlain(src) {
  let s = mdClean(src);
  // closed fences first, then a fence that was never closed runs to the end
  s = s.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, '\n');
  s = s.replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*$/m, '\n');
  s = s.replace(/`([^`]*)`/g, '$1');

  // Math, before the inline markers: a formula is full of '*' and '_' that are part
  // of the notation and must not be read as emphasis.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => ' ' + mdMathToPlain(tex) + ' ');
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (m, tex) => ' ' + mdMathToPlain(tex) + ' ');
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (m, tex) => ' ' + mdMathToPlain(tex) + ' ');
  s = s.replace(/\$([^$\n]+)\$/g, (m, tex) => (
    mdLooksLikeMath(tex) ? ' ' + mdMathToPlain(tex) + ' ' : m
  ));

  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/(^|\s)(https?:\/\/\S+)/g, '$1');
  s = s.replace(/^ {0,3}#{1,6}[ \t]+/gm, '');
  s = s.replace(/^ {0,3}>[ \t]?/gm, '');
  // a task box is spoken as its state, or the reader says "left bracket x right bracket"
  s = s.replace(/^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\][ \t]+/gm,
    (m, mark) => (mark.toLowerCase() === 'x' ? 'Done: ' : 'To do: '));
  s = s.replace(/^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+/gm, '');
  // the delimiter row goes before the pipes do — once they are spaces there is
  // nothing left to recognise it by
  s = s.replace(/^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm, '');
  s = s.replace(/^ {0,3}\|.*\|[ \t]*$/gm, (row) => row.replace(/\|/g, ' '));
  s = s.replace(/^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/gm, '\n');
  // only paired markers, so an identifier like max_tokens_used keeps its underscores
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2').replace(/~~([^~]+)~~/g, '$1');
  return s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
