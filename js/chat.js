// ============================================================
// CHAT — the screen: sending a message, rendering the reply
// ============================================================
// The chat is the whole app. Sending appends the message, asks the provider,
// renders the reply, and reads it aloud (js/tts.js) — the speech bar above the
// transcript can replay, pause or stop that reading. The markup lives in
// js/chat-view.js.
//
// One guard covers every way a request can start, so a double click, a held
// Enter and a stray programmatic click cannot put two requests in the air:
// state.busy is set before the await and cleared in the finally.

'use strict';

// How much of the conversation is resent. Without a cap every turn re-uploads
// the entire transcript, so cost and latency grow with the session.
const MAX_HISTORY = 24;

function nextTurnId() { return 't' + (state.transcript.length + 1); }

function clearEmptyState() {
  const empty = els.chat.querySelector('.empty-state');
  if (empty) empty.remove();
}

// Builds a bubble and appends it. Which role wrote the text decides how it is
// rendered, and that is the whole security boundary: 'markdown' is only ever passed
// for a model reply, and js/markdown.js escapes before it writes a single tag. A
// typed message and an error are plain paragraphs.
function appendBubble(cls, headerText, tag, bodyText, bodyFormat) {
  clearEmptyState();
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + cls;

  const head = document.createElement('div');
  head.className = 'bubble-header';
  head.textContent = headerText;
  if (tag) {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = tag;
    head.appendChild(t);
  }
  bubble.appendChild(head);

  if (bodyText !== undefined) {
    const body = document.createElement('div');
    body.className = 'bubble-body';
    if (bodyFormat === 'markdown') renderMarkdownInto(body, bodyText);
    else body.textContent = bodyText;
    bubble.appendChild(body);
  }

  els.chat.appendChild(bubble);
  scrollBottom(els.chat);
  return bubble;
}

function renderTurn(turn) {
  if (turn.kind === 'error') {
    appendBubble('ai error', 'Something went wrong', null, turn.text);
  } else if (turn.role === 'user') {
    appendBubble('user', 'You', turn.mode === 'voice' ? '· mic' : '', turn.text);
  } else {
    appendBubble('ai', 'AI', null, turn.text, 'markdown');
  }
}

function addTurn(turn) {
  state.transcript.push(turn);
  renderTurn(turn);
  updateControls();
}

// The model gets the running conversation so it can answer in context: without
// it, every reply is to a stranger.
function historyForRequest() {
  return state.messages.length <= MAX_HISTORY
    ? state.messages.slice()
    : state.messages.slice(-MAX_HISTORY);
}

// Provider failures arrive as "OpenAI 401: {"error":…}". Lead with what it means
// for the user and keep the status code out of the primary line.
function plainError(err, prov) {
  const status = err && err.status;
  if (status === 401 || status === 403) return `${prov.label} rejected the API key — check it in Settings`;
  if (status === 429) return `${prov.label} is busy right now — try again in a moment`;
  if (status === 400 || status === 404) return `${prov.label} would not accept the model “${prov.model}” — pick a current one in Settings`;
  if (status >= 500) return `${prov.label} had a server problem — try again`;
  // fetch() rejects a network failure with a TypeError before any status exists
  if (err && err.name === 'TypeError') return `Could not reach ${prov.label} — check your connection`;
  return (err && err.message) || String(err);
}

async function sendMessage() {
  if (state.busy) return;
  const text = els.chatText.value.trim();
  if (!text) return;

  const prov = activeProvider();
  if (!prov.key) {
    setApiError(`Enter your ${prov.label} API key to chat`);
    setStatus('API key required — open Settings', 'error');
    return;
  }

  stopListening();   // the message is committed — stop transcribing into it
  stopTTS();         // a new message interrupts the previous reply being read

  const mode = state.voiceTyped ? 'voice' : 'text';
  state.voiceTyped = false;
  els.chatText.value = '';
  autoGrowComposer();
  addTurn({ id: nextTurnId(), role: 'user', kind: 'text', text, mode, ts: new Date().toISOString() });
  state.messages.push({ role: 'user', content: text });

  state.busy = true;
  updateControls();

  const thinking = appendBubble('ai thinking', 'AI', null);
  // the spinner and the wording go in their own row so the header stays on its
  // own line, exactly as it does in a normal bubble
  const row = document.createElement('div');
  row.className = 'thinking-row';
  const spin = document.createElement('span');
  spin.className = 'loader';
  row.appendChild(spin);
  row.appendChild(document.createTextNode(`Thinking with ${prov.label} (${prov.model})…`));
  thinking.appendChild(row);
  scrollBottom(els.chat);

  try {
    const out = await callChat(prov, prov.model, historyForRequest());
    const reply = (out.text || '').trim();
    if (!reply) throw new Error('the model returned an empty reply');

    thinking.remove();
    addTurn({ id: nextTurnId(), role: 'ai', kind: 'text', text: reply, ts: new Date().toISOString() });
    state.messages.push({ role: 'assistant', content: reply });
    if (state.speech.autoSpeak) speakReply(reply);
  } catch (err) {
    const msg = plainError(err, prov);
    thinking.remove();
    addTurn({ id: nextTurnId(), role: 'ai', kind: 'error', text: msg, ts: new Date().toISOString() });
    setStatus(msg, 'error');
  } finally {
    state.busy = false;
    updateControls();
  }
}

// ---------- wiring ----------
function wireChat() {
  els.btnSend.addEventListener('click', sendMessage);
}
