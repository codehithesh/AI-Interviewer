// ============================================================
// Interview screen view — markup only
// ============================================================
// Mounted into the [data-view="interview"] placeholder inside .app by the
// mountView() call at the bottom of this file. Behaviour lives in js/interview.js.
// Which module owns which region:
//
//   header      — title, timer, [Export], [Settings]  → js/export.js, js/interview.js
//   rail        — AI tile + candidate tile + [Cam]    → js/participants.js
//   transcript  — bubbles + readiness card            → js/interview.js
//   composer    — [expand], text, [Mic], [>]          → js/composer.js
//   md popup    — full-screen editor + toolbar        → js/markdown-editor.js
//
// Every control is disabled in the markup and then enabled by updateControls():
// the screen boots into Ready, where the composer is deliberately inert, so a
// control that started enabled would be live for the moment before boot finishes.

'use strict';

const INTERVIEW_VIEW_HTML = `
<div class="iv" id="im-view" data-state="ready">

  <!-- ===================== HEADER ===================== -->
  <header class="iv-header">
    <span class="head-title">AI Interviewer</span>
    <span class="timer" id="im-timer" role="timer" title="No interview running">00:00:00</span>
    <div class="spacer"></div>
    <div class="head-actions">
      <div class="menu-wrap">
        <button id="btn-export" class="btn icon-btn" title="Export this session" aria-label="Export this session" aria-haspopup="true" aria-expanded="false" disabled><span class="ic ic-download" aria-hidden="true"></span></button>
        <div id="export-menu" class="menu hidden" role="menu">
          <button class="menu-item" data-format="json" role="menuitem">JSON</button>
          <button class="menu-item" data-format="markdown" role="menuitem">Markdown</button>
        </div>
      </div>
      <button id="btn-settings" class="btn icon-btn" title="Settings" aria-label="Settings"><span class="ic ic-gear" aria-hidden="true"></span></button>
    </div>
  </header>

  <div class="iv-main">

    <!-- ===================== LEFT RAIL: the two participants =====================
         Both tiles stay reachable on a narrow viewport — the rail becomes a
         horizontal strip above the chat rather than disappearing. -->
    <aside class="iv-rail" aria-label="Participants">
      <div class="participants">

        <!-- AI interviewer. The portrait is a local file loaded from icons/ — no
             external request, nothing uploaded. It fills the card edge to edge and
             the name is overlaid on its corner, rather than sitting in a strip
             below it. Both tiles carry the same fixed frame, so the rail reads as
             a pair rather than two differently-shaped cards. -->
        <div class="tile" id="im-avatar-tile">
          <div class="tile-media">
            <img class="avatar" id="im-avatar" src="icons/interviewer_face.jpg" alt="AI interviewer" width="640" height="360">
            <span class="tile-name">AI Interviewer</span>
          </div>
        </div>

        <!-- Candidate. A local self-view only: the stream is never recorded,
             never uploaded and never sent to any provider, and toggling [Cam]
             off stops its tracks outright. -->
        <div class="tile" id="im-candidate-tile">
          <div class="tile-media">
            <video id="im-video" class="self-view hidden" playsinline muted autoplay></video>
            <span id="im-initials" class="initials" aria-hidden="true"></span>
            <span class="tile-name" id="im-candidate-name">You</span>
          </div>
        </div>

      </div>

      <!-- Ready → [Start interview]; Live → [END]; Done → [Start interview] again,
           which clears the finished session and starts the next one in one press.
           Two labels on one button, and it is always the thing that moves the
           session on — there is no separate [Restart] to find first.
           [Cam] sits beside it rather than in the composer because it is not part
           of the interview at all: the self-view is local, so it stays live on all
           three screens (see js/composer.js). -->
      <div class="rail-actions">
        <button id="im-primary" class="btn primary rail-action" title="Start the interview">Start interview</button>
        <button id="im-cam" class="btn icon-btn" title="Turn your camera on" aria-label="Toggle your camera" aria-pressed="false"><span class="ic ic-cam" aria-hidden="true"></span></button>
      </div>
    </aside>

    <!-- ===================== RIGHT PANEL: chat ===================== -->
    <section class="iv-panel" aria-label="Interview">

      <!-- The speech bar, restored from the extension: one always-visible strip
           holding the voice, the speed, the auto-speak switch and the three
           transport buttons, so the reading controls are never behind a modal.
           updateControls() decides what each button may do, the labels come from
           js/tts.js, and js/settings.js stores the picks as they change. -->
      <div class="speech-bar">
        <span class="mini-label">Read aloud</span>
        <select id="voice-select" title="Voice" aria-label="Voice"></select>
        <select id="rate-select" title="Speed" aria-label="Reading speed">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1×</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
        <button id="btn-read" class="btn compact" title="Read the latest message aloud" disabled><span class="ic ic-play" aria-hidden="true"></span>Read</button>
        <button id="btn-pause" class="btn compact" title="Pause" disabled><span class="ic ic-pause" aria-hidden="true"></span>Pause</button>
        <button id="btn-stop" class="btn compact" title="Stop" disabled><span class="ic ic-stop" aria-hidden="true"></span>Stop</button>
        <label class="check" for="auto-speak" title="Speak every interviewer message as it arrives">
          <input type="checkbox" id="auto-speak" checked>
          <span>Auto-speak</span>
        </label>
      </div>

      <!-- A list, not a div soup: the transcript is an ordered sequence of turns.
           role="log" + aria-live announces each new interviewer message as it
           lands, without moving focus off the composer. -->
      <ol id="im-transcript" class="transcript" role="log" aria-live="polite" aria-label="Interview transcript"></ol>

       <!-- The status line (§8.3): Speaking / Listening / Thinking. It shows only
            while something is actually happening — a settled screen has nothing to
            report, so the bar is hidden entirely rather than holding a "Ready" line
            open above the composer. updateControls() (js/composer.js) owns that
            decision; the bar carries .shimmer while a request is in the air so a
            wait looks like one. -->
      <div id="im-status-bar" class="iv-status hidden">
        <span id="im-status" class="status-text" role="status" aria-live="polite"></span>
      </div>

      <!-- ===================== COMPOSER =====================
           One row, in reading order: [expand], which opens the answer field full
           screen, then the answer itself, then the two controls that finish it —
           [Mic] and [>]. The two send-side controls sit together at the end of the
           line, where the eye already is when the typing stops. -->
      <div class="composer">
        <div class="composer-row">
          <button id="im-plus" class="btn icon-btn" title="Expand the answer field" aria-label="Open the full-screen markdown editor" aria-haspopup="dialog" disabled><span class="ic ic-expand" aria-hidden="true"></span></button>
          <textarea id="im-text" rows="1" placeholder="Type or speak…" aria-label="Your answer" disabled></textarea>
          <button id="im-mic" class="btn icon-btn" title="Native speech-to-text" aria-label="Dictate your answer" disabled><span class="ic ic-mic" aria-hidden="true"></span><span class="rec-label">Recording</span></button>
          <button id="im-send" class="btn primary icon-btn" title="Send" aria-label="Send your answer" disabled><span class="ic ic-send" aria-hidden="true"></span></button>
        </div>
      </div>
    </section>
  </div>
</div>

<!-- ===================== MARKDOWN EDITOR =====================
     The answer field, full screen: the same text in a monospace <textarea> with a
     line-number gutter and a formatting toolbar. No CodeMirror, no Monaco, no CDN.
     Opened by the composer's [expand] icon.

     It is the composer made bigger, not a separate message: opening copies the
     field's text in, and every edit is written straight back to it — which is why
     there is no [Insert] button. Closing never loses a word, and [>] stays the only
     way to send. See js/markdown-editor.js.

     The toolbar is source editing only: each button writes markdown characters over
     the selection (a marker pair, a line prefix, a fence) and nothing is rendered
     here, so the field shows exactly what will be sent. The set is markdown.js's
     feature set — headings, emphasis, code, quote, lists, tasks, table, rule, link,
     image, math.

     The editor is still hand-rolled, so it carries the two things a code-shaped
     field is unusable without: the gutter, and Tab / Shift+Tab indentation. The
     gutter is decorative — the textarea already announces its own content — so it is
     hidden from assistive technology rather than read out as numbers. -->
<div id="im-md-modal" class="modal-overlay hidden">
  <div class="modal md-modal" role="dialog" aria-modal="true" aria-labelledby="im-md-title">
    <div class="modal-head">
      <h3 id="im-md-title">Markdown</h3>
      <div class="head-actions">
        <button id="im-md-close" class="btn icon-btn" title="Close the editor — your text stays in the answer field" aria-label="Close the markdown editor">✕</button>
      </div>
    </div>

    <!-- Formatting, under the header bar and above the text. aria-label plus role=group,
         not role=toolbar: the buttons are reached with Tab like every other control here,
         and a toolbar role would promise arrow-key navigation that is not implemented. -->
    <div id="im-md-toolbar" class="md-toolbar" role="group" aria-label="Markdown formatting">
      <button type="button" class="md-tool" data-md="bold" title="Bold — **text** (Ctrl+B)" aria-label="Bold">B</button>
      <button type="button" class="md-tool" data-md="italic" title="Italic — *text* (Ctrl+I)" aria-label="Italic">I</button>
      <button type="button" class="md-tool" data-md="strike" title="Strikethrough — ~~text~~" aria-label="Strikethrough">S</button>
      <button type="button" class="md-tool" data-md="code" title="Inline code — a backtick pair (Ctrl+E)" aria-label="Inline code">&lt;/&gt;</button>
      <button type="button" class="md-tool" data-md="link" title="Link — [text](url) (Ctrl+K)" aria-label="Link">Link</button>
      <button type="button" class="md-tool" data-md="image" title="Image — ![alt](url)" aria-label="Image">Image</button>
      <span class="md-tool-sep" aria-hidden="true"></span>
      <button type="button" class="md-tool" data-md="h1" title="Heading 1 — # text" aria-label="Heading 1">H1</button>
      <button type="button" class="md-tool" data-md="h2" title="Heading 2 — ## text" aria-label="Heading 2">H2</button>
      <button type="button" class="md-tool" data-md="h3" title="Heading 3 — ### text" aria-label="Heading 3">H3</button>
      <button type="button" class="md-tool" data-md="h4" title="Heading 4 — #### text" aria-label="Heading 4">H4</button>
      <button type="button" class="md-tool" data-md="h5" title="Heading 5 — ##### text" aria-label="Heading 5">H5</button>
      <button type="button" class="md-tool" data-md="h6" title="Heading 6 — ###### text" aria-label="Heading 6">H6</button>
      <span class="md-tool-sep" aria-hidden="true"></span>
      <button type="button" class="md-tool" data-md="quote" title="Blockquote — > text" aria-label="Blockquote">Quote</button>
      <button type="button" class="md-tool" data-md="codeblock" title="Code block — three backticks above and below" aria-label="Code block">Code block</button>
      <button type="button" class="md-tool" data-md="ul" title="Bulleted list — - item" aria-label="Bulleted list">• List</button>
      <button type="button" class="md-tool" data-md="ol" title="Numbered list — 1. item" aria-label="Numbered list">1. List</button>
      <button type="button" class="md-tool" data-md="task" title="Task list — - [ ] item" aria-label="Task list">☐ Task</button>
      <button type="button" class="md-tool" data-md="table" title="Table — | a | b | with a --- delimiter row" aria-label="Table">Table</button>
      <button type="button" class="md-tool" data-md="hr" title="Horizontal rule — ---" aria-label="Horizontal rule">―</button>
      <span class="md-tool-sep" aria-hidden="true"></span>
      <button type="button" class="md-tool" data-md="math" title="Inline math — $x$" aria-label="Inline math">$x$</button>
      <button type="button" class="md-tool" data-md="mathblock" title="Display math — $$ on its own lines" aria-label="Display math">$$x$$</button>
    </div>

    <div class="modal-body md-body">
      <label class="sr-only" for="im-md">Your answer, as Markdown</label>
      <div class="md-editor">
        <div class="md-gutter" aria-hidden="true"><span id="im-md-gutter" class="md-gutter-inner">1</span></div>
        <textarea id="im-md" class="md-input" autocomplete="off" placeholder="Your answer, full screen. Type Markdown here — the toolbar above adds the syntax, and it is sent exactly as written."></textarea>
      </div>
    </div>
  </div>
</div>
`;

mountView('interview', INTERVIEW_VIEW_HTML);
