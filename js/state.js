// ============================================================
// Shared application state
// ============================================================
// Session data lives here and only here. Nothing in this object is ever written
// to storage — the saved preferences (keys, provider, model, theme, speech)
// live in js/store.js. Closing the tab ends the conversation for good.

'use strict';

const state = {
  provider: 'openai',
  busy: false,          // one in-flight model request guard
  voiceTyped: false,    // the last message came from the mic
  listening: false,     // speech recognition is recording
  speaking: false,      // TTS is reading a reply aloud

  messages: [],         // model history — [{ role, content }]
  transcript: [],       // rendered turns — [{ id, role, kind, text, mode, ts }]

  speech: { voice: '', rate: 1, autoSpeak: true },

  tts: { active: false, paused: false, utter: null },
};
