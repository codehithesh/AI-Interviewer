// ============================================================
// Shared application state
// ============================================================
// Session data lives here and only here. Nothing in this object is ever written to
// storage — the saved preferences (keys, provider, models, appearance, interview
// configuration, speech) live in js/store.js. Closing the tab ends the interview
// for good; export is the only way to keep one.
//
// Two things in here are worth knowing before you touch them:
//
//  · `config` is a SNAPSHOT. It is filled from the saved preferences the moment
//    the user presses [Start interview] and is not read from storage again, so a
//    Settings edit mid-interview applies to the next interview rather than
//    mutating the one in progress.
//  · `busy` is the single in-flight guard. Every path that can start a model
//    request — the send button, [Try again], the automatic next-question request
//    and the final evaluation — checks it, so no two requests can be in the air.

'use strict';

const state = {
  // ---------- provider / request ----------
  provider: 'openai',
  busy: false,            // single in-flight model request guard

  // ---------- speech ----------
  voiceTyped: false,      // the answer being composed came from the mic
  listening: false,       // speech recognition is recording (the user's intent)
  speaking: false,        // TTS active → drives mic gating and the status line

  // ---------- the configuration this interview started with ----------
  config: {
    role: '',
    interviewType: 'general',
    difficulty: 'medium',
    duration: 60,         // minutes — always set; the header timer counts down from it
    questions: null,      // cap, or null for no limit
    prompt: '',
  },

  // ---------- screen state ----------
  view: 'ready',          // 'ready' | 'live' | 'done'
  startedAt: null,
  finishedAt: null,
  endedReason: null,      // 'end' | 'timer' | 'question_cap'

  // ---------- conversation ----------
  messages: [],           // model history — [{ role, content }]
  transcript: [],         // rendered turns, including code attachments
  answers: [],            // candidate answers only, for the evaluation
  questionNumber: 0,

  // ---------- media ----------
  cameraOn: false,
  stream: null,           // local MediaStream — never leaves the browser

  // ---------- speech preferences ----------
  speech: { voice: '', rate: 1, autoSpeak: true },

  // ---------- results ----------
  evaluation: null,       // { ok, provider, model, result } | { ok: false, error }

  tts: { active: false, paused: false, utter: null },

  // What the composer held before dictation began, so a spoken answer appends to
  // whatever was already typed instead of replacing it (js/stt.js).
  recBase: '',
};
