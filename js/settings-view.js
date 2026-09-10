// ============================================================
// Settings pane — markup only
// ============================================================
// Mounted into the [data-view="settings"] placeholder at the end of <body> by the
// mountView() call at the bottom of this file. Behaviour lives in js/settings.js.

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

      <h4 class="modal-label">AI evaluation provider</h4>
      <p class="hint">Pick a provider and type its API key, then choose its model. Nothing is stored until you press <b>Save</b> — saving keeps the keys, the provider, the models and your light/dark choice in this extension’s private browser storage (nothing else can read them). Keys are sent only to their provider when you evaluate. “Forget saved keys” erases them from the browser completely.</p>

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
