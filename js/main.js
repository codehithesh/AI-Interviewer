// ============================================================
// BOOT
// ============================================================
// Loaded last. Everything is declared by now, so this file wires the modules
// together and starts the app. Listeners are attached synchronously first, so no
// click can fall through while the saved settings are still being read.
//
// The order at the end matters: initSettings() is what loads the saved interview
// configuration, so the Ready card can only be painted after it resolves — and
// snapshotConfig() reads from `prefs`, so the two go together.

'use strict';

function wireGlobals() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Escape closes the code editor and the Settings modal (§15). The code
      // editor is closed through its own function so a non-empty draft is kept.
      if (typeof closeCodeEditor === 'function') closeCodeEditor();
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((ov) => closeModal(ov));
      if (typeof closeExportMenu === 'function') closeExportMenu();
    }
  });
}

async function init() {
  // 1 · the mounted views are in the DOM — cache their elements
  cacheEls();

  // 2 · wiring (synchronous, so the UI is live immediately).
  // initCodeEditor() comes before wireModals() on purpose: it attaches the code
  // popup's own overlay handler first, so an overlay click closes it exactly as the
  // ✕ does — keeping the draft and handing focus back to the composer — instead of
  // letting the generic handler hide the modal before the draft is written down.
  initCodeEditor();
  wireModals();
  wireToasts();
  wireGlobals();
  initTheme();
  initTTS(updateControls);
  initParticipants();
  initSTT();
  wireComposer();
  wireInterview();
  wireMarkdown();
  wireExport();
  wireSettings();

  // 3 · saved settings: keys, provider, models, appearance, speech, interview
  await initSettings();

  // 4 · the Ready screen reflects the configuration that was just loaded
  snapshotConfig();
  setView('ready');
  renderReadiness();
}

init();
