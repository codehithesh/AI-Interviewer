// ============================================================
// BOOT
// ============================================================
// Loaded last. Everything is declared by now, so this file wires the modules
// together and starts the app. Listeners are attached synchronously first, so no
// click can fall through while the saved settings are still being read.

'use strict';

function wireGlobals() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((ov) => closeModal(ov));
      closeExportMenu();
    }
  });
}

async function init() {
  // 1 · the mounted views are in the DOM — cache their elements
  cacheEls();

  // 2 · wiring (synchronous, so the UI is live immediately)
  wireModals();
  wireToasts();
  wireGlobals();
  initTheme();
  initTTS(updateControls);
  initSTT();
  wireComposer();
  wireChat();
  wireMarkdown();
  wireExport();
  wireSettings();

  // 3 · saved settings: keys, provider, models, appearance, speech
  await initSettings();

  // 4 · the chat is ready for the first message
  updateControls();
  autoGrowComposer();
}

init();
