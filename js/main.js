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
      // Escape closes the markdown editor and the Settings modal (§15). The editor
      // is closed through its own function so focus goes back to the answer field.
      if (typeof closeMarkdownEditor === 'function') closeMarkdownEditor();
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((ov) => closeModal(ov));
      if (typeof closeExportMenu === 'function') closeExportMenu();
    }
  });
}

async function init() {
  // 1 · the mounted views are in the DOM — cache their elements
  cacheEls();

  // 2 · wiring (synchronous, so the UI is live immediately).
  // initMarkdownEditor() comes before wireModals() on purpose: it attaches the
  // editor's own overlay handler first, so an overlay click closes it exactly as the
  // ✕ does — handing focus back to the composer — instead of letting the generic
  // handler hide the modal first.
  initMarkdownEditor();
  wireModals();
  wireToasts();
  wireGlobals();
  initTheme();
  initTTS(updateControls);
  initParticipants();
  initSTT();
  wireComposer();
  wireInterview();
  initEvaluation();
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
