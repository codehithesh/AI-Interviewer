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
//   composer    — [+], text, [Mic], [>]               → js/composer.js
//   code popup  — monospace textarea                  → js/code-editor.js
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
           One row, in reading order: [</>], which puts code INTO the answer, then the
           answer itself, then the two controls that finish it — [Mic] and [>]. The
           two send-side controls sit together at the end of the line, where the eye
           already is when the typing stops. -->
      <div class="composer">
        <div class="composer-row">
          <button id="im-plus" class="btn icon-btn" title="Attach code" aria-label="Open the code editor" aria-haspopup="dialog" disabled><span class="ic ic-code" aria-hidden="true"></span></button>
          <textarea id="im-text" rows="1" placeholder="Type or speak…" aria-label="Your answer" disabled></textarea>
          <button id="im-mic" class="btn icon-btn" title="Native speech-to-text" aria-label="Dictate your answer" disabled><span class="ic ic-mic" aria-hidden="true"></span><span class="rec-label">Recording</span></button>
          <button id="im-send" class="btn primary icon-btn" title="Send" aria-label="Send your answer" disabled><span class="ic ic-send" aria-hidden="true"></span></button>
        </div>
      </div>
    </section>
  </div>
</div>

<!-- ===================== CODE EDITOR POPUP =====================
     A monospace <textarea> with a line-number gutter — no CodeMirror, no Monaco,
     no CDN. Opened by the composer's [</>]. [Insert into answer] does NOT send: it
     drops the draft into the composer as a fenced code block and closes, so prose
     and code leave as one answer. That overrides §5 — see js/code-editor.js for why.

     The editor is still hand-rolled, so it carries only the two things a code
     field is unusable without: the gutter, and Tab / Shift+Tab indentation
     (js/code-editor.js). The gutter is decorative — the textarea already
     announces its own content — so it is hidden from assistive technology
     rather than read out as numbers. -->
<div id="im-code-modal" class="modal-overlay hidden">
  <div class="modal code-modal" role="dialog" aria-modal="true" aria-labelledby="im-code-title">
    <div class="modal-head">
      <h3 id="im-code-title">Code</h3>
      <div class="head-actions">
        <button id="im-code-insert" class="btn primary" title="Add this code to your answer as a code block" disabled>Insert into answer</button>
        <button id="im-code-close" class="btn icon-btn" title="Close the code editor, keeping the draft" aria-label="Close the code editor, keeping the draft">✕</button>
      </div>
    </div>
    <div class="modal-body code-body">
      <label class="sr-only" for="im-code">Code to add to your answer</label>
      <div class="code-editor">
        <div class="code-gutter" aria-hidden="true"><span id="im-code-gutter" class="code-gutter-inner">1</span></div>
        <textarea id="im-code" class="code-input" spellcheck="false" autocomplete="off" placeholder="Paste or type code here — [Insert into answer] adds it to your answer as a code block."></textarea>
      </div>
    </div>
  </div>
</div>
`;

mountView('interview', INTERVIEW_VIEW_HTML);
