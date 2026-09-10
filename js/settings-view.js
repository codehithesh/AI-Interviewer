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
    <div class="modal-body">
      <div class="appearance-row">
        <h4 class="modal-label appearance-label">Appearance</h4>
        <div class="seg">
          <button id="theme-system" class="seg-btn active"><span class="ic ic-monitor" aria-hidden="true"></span>System</button>
          <button id="theme-light" class="seg-btn"><span class="ic ic-sun" aria-hidden="true"></span>Light</button>
          <button id="theme-dark" class="seg-btn"><span class="ic ic-moon" aria-hidden="true"></span>Dark</button>
        </div>
      </div>

      <!-- ===================== INTERVIEW =====================
           These fields shape the session. They are a snapshot taken when
           [Start interview] is pressed, so editing them mid-interview applies to
           the next interview rather than the one in progress. -->
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
          <input type="number" id="iv-duration" min="1" step="1" placeholder="No time limit" autocomplete="off">
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

      <h4 class="modal-label">AI provider</h4>
      <p class="hint">Pick a provider and type its API key, then choose its model. Nothing is stored until you press <b>Save</b> — saving keeps the keys, the provider, the models, the interview settings and your appearance choice in this browser's own storage. (The voice, speed and auto-speak in the speech bar save themselves as you change them.) Keys are sent only to their provider when the interviewer asks a question. <b>Forget saved keys</b> erases them from the browser completely.</p>

      <div id="provider-list"></div>

      <div class="forget-row">
        <button id="btn-forget-keys" class="btn compact" disabled><span class="ic ic-trash" aria-hidden="true"></span>Forget saved keys</button>
        <span class="hint">Erases any saved keys from this browser.</span>
      </div>

      <div id="api-error"></div>
    </div>
  </div>
</div>
`;

mountView('settings', SETTINGS_VIEW_HTML);
