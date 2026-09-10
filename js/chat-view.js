// ============================================================
// Chat view — markup only
// ============================================================
// Mounted into the [data-view="chat"] placeholder inside .app by the mountView()
// call at the bottom of this file. Behaviour lives in js/chat.js.

'use strict';

const CHAT_VIEW_HTML = `
    <section class="chat-col" id="chat-col">
      <div class="chat-head">
        <span class="head-title">AI Interviewer</span>
        <div class="spacer"></div>
        <div class="head-actions">
          <div class="menu-wrap">
            <button id="btn-export" class="btn icon-btn" title="Export this conversation" aria-label="Export this conversation" aria-haspopup="true" aria-expanded="false" disabled><span class="ic ic-download" aria-hidden="true"></span></button>
            <div id="export-menu" class="menu hidden" role="menu">
              <button class="menu-item" data-format="json" role="menuitem">JSON</button>
              <button class="menu-item" data-format="markdown" role="menuitem">Markdown</button>
            </div>
          </div>
          <button id="btn-settings" class="btn icon-btn" title="Settings" aria-label="Settings"><span class="ic ic-gear" aria-hidden="true"></span></button>
        </div>
      </div>

      <!-- The speech bar, restored from the extension: it sits directly under the
           nav bar and holds the voice, the speed and the transport buttons, so the
           reading controls are never tucked away in a modal. Markup only —
           js/composer.js decides what is enabled, js/tts.js does the speaking, and
           js/settings.js stores the voice and speed as they change. -->
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
        <button id="btn-read" class="btn compact" title="Read the latest reply aloud" disabled><span class="ic ic-play" aria-hidden="true"></span>Read</button>
        <button id="btn-pause" class="btn compact" title="Pause" disabled><span class="ic ic-pause" aria-hidden="true"></span>Pause</button>
        <button id="btn-stop" class="btn compact" title="Stop" disabled><span class="ic ic-stop" aria-hidden="true"></span>Stop</button>
      </div>

      <!-- role="log" + aria-live: screen readers announce each new message as it
           lands, without focus ever being moved off the composer. -->
      <div id="chat" class="chat" role="log" aria-live="polite" aria-label="Conversation">
        <div class="empty-state">
          Say something to start.<br>
          Type below, or press the mic and speak — every reply is read aloud.
        </div>
      </div>

      <div class="composer">
        <div id="chat-hint" class="dim">Ready</div>
        <div class="composer-row">
          <textarea id="chat-text" rows="1" placeholder="Type or speak…"></textarea>
          <button id="btn-mic" class="btn icon-btn" title="Native speech-to-text" aria-label="Dictate your message"><span class="ic ic-mic" aria-hidden="true"></span><span class="rec-label">Recording</span></button>
          <button id="btn-send" class="btn primary icon-btn" title="Send" aria-label="Send message"><span class="ic ic-send" aria-hidden="true"></span></button>
        </div>
      </div>
    </section>
`;

mountView('chat', CHAT_VIEW_HTML);
