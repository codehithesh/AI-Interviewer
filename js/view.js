// ============================================================
// View mounting
// ============================================================
// Each UI pane keeps its markup in its own file — js/settings-view.js and
// js/reactions-view.js — instead of in a shared, ever-growing index.html.
//
// Why the markup is carried in a script and not in a fetched .html partial: a
// page opened straight from disk (file://) is not allowed to read any other
// local file, so fetch()/XHR of a sibling .html file fails there, and module
// scripts are blocked as well. A plain <script> has no such restriction, so it
// is the one include mechanism that works identically over file://, over
// http:// and inside the extension.
//
// mountView() swaps the markup into the matching placeholder in index.html
// synchronously, while the document is still parsing, so every element exists
// before the behaviour scripts and boot run.

'use strict';

function mountView(name, html) {
  const slot = document.querySelector('[data-view="' + name + '"]');
  if (!slot) {
    console.error('Reaction Learner: no mount point found for the "' + name + '" view');
    return;
  }
  // A <template> parses the markup without executing anything, and replaceWith
  // drops the fragment in place of the placeholder — no wrapper element is left
  // behind, so the pane keeps the exact DOM position it had when it was inline.
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  slot.replaceWith(tpl.content);
}
