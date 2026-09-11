// ============================================================
// Settings view — markup only
// ============================================================
// Mounted into the [data-view="settings"] placeholder at the end of <body> by the
// mountView() call at the bottom of this file. Behaviour lives in js/settings.js.
//
// The modal is the single configuration surface and always edits a draft: storage
// is only touched by Save, and closing without saving throws the draft away. The
// speech controls are the deliberate exception — Voice, Speed and Auto-speak live
// in the always-visible bar on the interview screen, not behind this modal, so
// they take effect and are stored as they change.

'use strict';

const SETTINGS_VIEW_HTML = `
<!-- ===================== SETTINGS MODAL ===================== -->
<div id="settings-modal" class="modal-overlay hidden">
  <div class="modal">
    <div class="modal-head">
      <h3>Settings</h3>
      <div class="head-actions">
        <button id="btn-save-settings" class="btn primary" title="Save keys and preferences">Save</button>
        <button id="btn-close-settings" class="btn icon-btn" title="Close without saving" aria-label="Close">✕</button>
      </div>
    </div>
    <!-- Each group of settings is a .settings-section, and the rule between two
         of them comes from the sections themselves (styles.css) rather than from
         headings scattered down one flat column — the whole modal used to read as
         a single undivided list. -->
    <div class="modal-body">

      <!-- ===================== APPEARANCE ===================== -->
      <div class="settings-section">
        <div class="appearance-row">
          <h4 class="modal-label appearance-label">Appearance</h4>
          <div class="seg">
            <button id="theme-system" class="seg-btn active"><span class="ic ic-monitor" aria-hidden="true"></span>System</button>
            <button id="theme-light" class="seg-btn"><span class="ic ic-sun" aria-hidden="true"></span>Light</button>
            <button id="theme-dark" class="seg-btn"><span class="ic ic-moon" aria-hidden="true"></span>Dark</button>
          </div>
        </div>
      </div>

      <!-- ===================== CHAT =====================
           A display choice, not part of the interview brief: when this is on,
           every interviewer message in the chat is covered by a solid panel
           reading "Hidden". The reply text is never removed — it is still in the
           DOM and in the export — so turning the mask off brings it straight
           back. Candidate answers, notices and the evaluation are never masked. -->
      <div class="settings-section">
        <h4 class="modal-label">Chat</h4>
        <!-- The switch IS the checkbox the behaviour reads (js/settings.js reads
             .checked) — restyled rather than replaced, so the control and the code
             that stores it cannot drift apart. It is last in the row, which is what
             puts it at the right-hand edge with the label opposite it. -->
        <label class="switch-row" for="mask-ai-replies">
          <span class="switch-label">Mask AI replies</span>
          <input type="checkbox" id="mask-ai-replies" class="switch" role="switch">
        </label>
        <p class="hint">Covers each interviewer message in the chat with a solid <b>Hidden</b> panel. Your answers, the notices and the final evaluation stay visible, and nothing is deleted — the reply is still there to export and comes back the moment you unmask it.</p>
      </div>

      <!-- ===================== INTERVIEW =====================
           These fields shape the session. They are a snapshot taken when
           [Start interview] is pressed, so editing them mid-interview applies to
           the next interview rather than the one in progress. -->
      <div class="settings-section">
        <h4 class="modal-label">Interview</h4>
        <p class="hint">These shape the interviewer's brief. Leave anything blank and it simply is not mentioned — an unconfigured interview still works. Changes apply to the next interview you start.</p>

        <div class="field-grid">
          <div class="field">
            <label for="iv-role">Role</label>
            <input type="text" id="iv-role" placeholder="e.g. Senior backend engineer" autocomplete="off">
          </div>
          <div class="field">
            <label for="iv-type">Interview type</label>
            <select id="iv-type">
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="behavioral">Behavioral</option>
            </select>
          </div>
          <div class="field">
            <label for="iv-difficulty">Difficulty</label>
            <select id="iv-difficulty">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div class="field">
            <label for="iv-duration">Duration (minutes)</label>
            <input type="number" id="iv-duration" min="1" step="1" placeholder="60" autocomplete="off">
          </div>
          <div class="field">
            <label for="iv-questions">Questions</label>
            <input type="number" id="iv-questions" min="1" step="1" placeholder="No limit" autocomplete="off">
          </div>
        </div>

        <div class="field">
          <label for="iv-prompt">Prompt</label>
          <textarea id="iv-prompt" rows="3" placeholder="Anything the interviewer should focus on, ask about, or avoid."></textarea>
        </div>
      </div>

      <!-- ===================== AI PROVIDER ===================== -->
      <div class="settings-section">
        <h4 class="modal-label">AI provider</h4>
        <p class="hint">Pick a provider and type its API key, then choose its model. Nothing is stored until you press <b>Save</b> — saving keeps the keys, the provider, the models, the interview settings and your appearance choice in this browser's own storage. (The voice, speed and auto-speak in the speech bar save themselves as you change them.) Keys are sent only to their provider when the interviewer asks a question. <b>Forget saved keys</b> erases them from the browser completely.</p>

        <div id="provider-list"></div>

        <div class="forget-row">
          <button id="btn-forget-keys" class="btn compact" disabled><span class="ic ic-trash" aria-hidden="true"></span>Forget saved keys</button>
          <span class="hint">Erases any saved keys from this browser.</span>
        </div>

        <!-- Key trouble is reported inside the section that owns the keys, so a
             message about an API key sits with the fields it is about. -->
        <div id="api-error"></div>
      </div>

    </div>
  </div>
</div>
`;

mountView('settings', SETTINGS_VIEW_HTML);
