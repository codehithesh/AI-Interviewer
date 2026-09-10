// ============================================================
// Shared application state
// ============================================================
// Session data lives here and only here. Nothing in this object is ever written
// to storage, so closing the tab ends the session for good.

'use strict';

// The extension gets the chrome.* APIs; a plain file:// or http:// tab does not.
const isExt = location.protocol === 'chrome-extension:';

// Context budget for the slice of source text sent along with a reaction.
const MAX_SLICE_CHARS = 90000;

const state = {
  sourceTitle: '',
  sourceUrl: '',
  paras: [],          // [{ text }] — reading segments
  prefixLen: [],      // cumulative chars through paragraph i
  totalChars: 0,
  markerP: -1,        // paragraph index the user has read to (T)
  pending: null,      // { markerP } — awaiting send
  reactions: [],      // { id, text, mode, atParagraph, sliceText, truncated, sliceNote, sliceChars, ts }
  evals: [],          // { reactionId, provider, model, ok, error, result, raw }
  provider: 'openai',
  reactionsOpen: false, // full-screen reactions sheet visibility
  busyEval: false,
  voiceTyped: false,  // reaction text came from the mic
  listening: false,
  recBase: '',
  tts: { active: false, paused: false, idx: -1, utter: null },
};
