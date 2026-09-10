// ============================================================
// Source modal — markup only
// ============================================================
// Mounted into the [data-view="source"] placeholder in index.html by the
// mountView() call at the bottom of this file. Behaviour lives in js/source.js.
//
// Kept in its own file for the same reason as the settings and reactions panes:
// a page opened over file:// may not read another local file, so markup carried
// in a plain <script> is the one include that works identically over file://,
// over http:// and inside the extension.

'use strict';

const SOURCE_VIEW_HTML = `
<!-- ===================== SOURCE MODAL (paste text or load a URL) ===================== -->
<div id="source-modal" class="modal-overlay hidden">
  <div class="modal">
    <div class="modal-head">
      <h3>Add source text</h3>
      <button class="btn compact" data-close="source-modal" title="Close">✕</button>
    </div>
    <div class="modal-body">
      <!-- Two ways in: paste it yourself, or hand over a link and let the
           browser load the page. One Load text button, acting on whichever
           tab is showing. -->
      <div class="seg" id="source-tabs" role="tablist" aria-label="Where the text comes from">
        <button id="tab-paste" class="seg-btn active" role="tab" aria-selected="true" aria-controls="pane-paste" data-source-tab="paste">Add custom text</button>
        <button id="tab-url" class="seg-btn" role="tab" aria-selected="false" aria-controls="pane-url" data-source-tab="url">Enter URL</button>
      </div>

      <div id="pane-paste" class="source-pane" role="tabpanel" aria-labelledby="tab-paste">
        <p class="hint">Paste the article, lecture notes or chapter you want to study. Paragraphs and line breaks are kept. It stays in memory only.</p>
        <textarea id="paste-text" rows="10" placeholder="Paste any text — an article, lecture notes, a book chapter…" spellcheck="false"></textarea>
        <p class="hint">Tip: to study a webpage, click the extension’s toolbar icon while on that page — its readable text loads automatically.</p>
      </div>

      <div id="pane-url" class="source-pane hidden" role="tabpanel" aria-labelledby="tab-url">
        <p class="hint">Paste a link to an article, notes page or blog post. The page is opened quietly in the background, its readable text is taken, and the tab is closed again. Sign-in and JavaScript-rendered pages work, because it is a real page load.</p>
        <input type="url" id="url-input" placeholder="https://example.com/article" autocomplete="off" spellcheck="false">
        <p class="hint" id="url-hint">Loaded text stays in memory only — the address is never sent to your AI provider.</p>
      </div>

      <div class="modal-actions">
        <button class="btn" data-close="source-modal">Cancel</button>
        <button id="load-source" class="btn primary">Load text</button>
      </div>
    </div>
  </div>
</div>
`;

mountView('source', SOURCE_VIEW_HTML);
