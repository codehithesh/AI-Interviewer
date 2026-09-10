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
      if (els.reactionsCol.classList.contains('open')) closeReactions();
      closeExportMenu();
    }
  });
}

async function init() {
  // 1 · the mounted panes are in the DOM — cache their elements
  cacheEls();

  // 2 · wiring (synchronous, so the UI is live immediately)
  wireModals();
  wireToasts();
  wireGlobals();
  initTheme();
  initTTS();
  initSTT();
  wireReader();
  wireSource();
  wireComposer();
  wireReactions();
  wireExport();
  wireSettings();

  // 3 · saved settings: keys, provider, models, appearance
  await initSettings();

  // 4 · open on the reading pane
  setReactionsOpen(false);  // the sheet stays out of the way until React
  consumePendingGrab();
  updateControls();
  autoGrowComposer();
}

init();
