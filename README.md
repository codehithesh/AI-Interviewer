# AI Interviewer

![AI Interviewer](https://github.com/codehithesh/AI-Interviewer/blob/main/assets/s1.png)

A voice-first interview practice app. You configure an interview once in Settings,
press **Start interview**, and an AI interviews you out loud — one question at a time.
You answer by speaking or by typing, optionally attaching code from a code editor
popup. When the interview ends, a single evaluation is written into the transcript.

It is a static site: `index.html` plus `styles.css` and the files in `js/`, with no
build step, no dependencies, and no backend of any kind. Open it from a static host
and it runs.

**Live:** https://codehithesh.github.io/AI-Interviewer/

## What you need

- **An API key** for one of the nine supported providers: OpenAI, Anthropic (Claude),
  Google (Gemini), DeepSeek, Moonshot (Kimi), Grok, Qwen, Z.ai (GLM) or Muse Spark
  (Meta). You pay that
  provider directly for what you use; this project has no server and never sees your key.
- **A browser, served over `http://localhost` or HTTPS.** The microphone and the
  camera only work in a secure context, so opening `index.html` by double-clicking
  it (`file://`) disables both. Any static server will do:
  `python3 -m http.server 8123`, then visit <http://localhost:8123/>.
- **Chrome or Edge for voice input.** Speech recognition is Chrome-only, and Edge's
  support is unreliable. On any other browser the app degrades to a type-only
  interview rather than breaking.

## Using it

1. Open **Settings**. Paste an API key for the provider you want, check the model ID
   against that provider's current documentation (the field is a free-text input with
   suggestions, so a renamed model is correctable by typing), and fill in the
   interview: role, type, difficulty, duration, question cap and an optional seed
   prompt. Press **Save**.
2. **Start interview.** The interviewer greets you, introduces the session and asks
   the first question — spoken aloud.
3. Answer. `[Mic]` dictates, the textarea takes typing, `Enter` sends and
   `Shift+Enter` adds a newline. `[+]` opens a full-screen code editor whose *Insert
   into answer* puts a fenced block into your answer, so prose and code travel as one
   message.
4. `[Cam]` shows a local self-view. It is never recorded and never sent anywhere.
5. The interview ends when you press `[END]`, when the countdown reaches zero, or when
   the question cap is reached. The evaluation then runs once and appears as the last
   item in the transcript.
6. **Export** the session as JSON or Markdown at any time — a live session can be
   saved too. `[Start interview]` comes back on the Done screen and begins a new
   interview, clearing the finished one and keeping your settings.

Settings always edit a draft: nothing is stored until you press **Save**, and closing
without saving throws the draft away.

Under **Chat**, *Mask AI replies* covers each interviewer message in the transcript
with a solid **Hidden** panel. The reply is never removed — it stays in the DOM, in
the export and for the model's own history — so unticking the box brings every message
straight back. Your answers, the notices and the final evaluation are never masked.

## Providers

| Provider | Notes |
| --- | --- |
| OpenAI | Chat Completions |
| Anthropic | Messages API; direct browser access is requested explicitly |
| Google Gemini | OpenAI-compatible endpoint |
| DeepSeek | Chat Completions; both current models support `response_format` |
| Moonshot (Kimi) | OpenAI-compatible |
| Grok | OpenAI-compatible (xAI) |
| Qwen | Alibaba Model Studio (Singapore), OpenAI-compatible |
| Z.ai | Zhipu GLM, OpenAI-compatible |
| Muse Spark | Meta Model API (`api.meta.ai`), OpenAI-compatible |

Only `message.content` is ever read — any `reasoning_content` or chain-of-thought a
model returns is discarded and never rendered, logged or spoken.

A reasoning model will sometimes answer with **private reasoning and no answer at all**:
`content` is `""` while `reasoning_content` holds a full plan for the question it never
wrote. It is a normal HTTP 200 with `finish_reason: "stop"`, so there is nothing wrong
with your key, your credit or your connection. The app asks once more with an explicit
instruction to write the answer, and if that comes back empty too it says so plainly,
naming the model — the reasoning itself is still never shown or spoken.

The interviewer asks a JSON-capable model for JSON (`{"type","question","reason"}`) and
every provider that accepts `response_format` is made to honour it. A model that cannot
be — declared per provider with `noJson`, though none of the eight shipped today needs
it — is asked for the spoken sentence
directly instead of for JSON in words, because a reasoning model's chain of thought and
its answer share one output budget and a JSON object is what gets cut off. Either way a
**plain-spoken sentence is accepted as a complete turn**: it is shown and read aloud
exactly like a JSON reply, with no warning, because a question is a question. You lose
only the private `reason` note. A truncated reply object is read for the question it
still contains rather than thrown away.

The evaluation is different: a scorecard needs an object, so on such a model the
scoring fails and says so, naming a model that works.

Anthropic and Qwen validate the shape of the `messages` array rather than just reading
it: Anthropic requires a non-empty array that alternates and begins on a `user` turn,
and Qwen requires it to end on one. The interview transcript satisfies neither on its
opening turn, which carries only a system prompt, and Anthropic's is also led by the
interviewer's own question. Those providers declare `strictRoles` and the request is
repaired for them — see `roleSafeMessages()` in `js/api.js`.

Every provider is called **directly from your browser** with your key. No proxy is
added. If a provider blocks cross-origin browser requests, the app says so plainly
and names the provider; it does not invent a workaround.

## Privacy

The short version: there is no server, nothing is collected, and the transcript is
never written to storage. Camera video never leaves the browser. Your microphone
audio is streamed to Google for recognition by Chrome's own speech recogniser — the
one place your audio leaves the machine. See [PRIVACY.md](PRIVACY.md) for the full
account.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | The single page: mount points, boot guard, script order. |
| `styles.css` | All styling, the wiggle animation and `prefers-reduced-motion`. |
| `js/interview-view.js` | Interview screen markup: header, rail, chat, composer, code popup. |
| `js/interview.js` | Ready/Live/Done, the answer → question loop, the timer, the question cap. |
| `js/interviewer.js` | The interviewer system prompt, reply parsing, history trimming. |
| `js/evaluation.js` | The end-of-interview evaluation prompt, call and rendering. |
| `js/participants.js` | The AI tile's speaking wiggle and the webcam self-view. |
| `js/tts.js` / `js/stt.js` | Native text-to-speech and speech-to-text. |
| `js/code-editor.js` | The code popup and its draft. |
| `js/api.js` / `js/providers.js` | The only network layer, and the provider definitions. |
| `js/store.js` / `js/settings.js` / `js/settings-view.js` | Saved preferences and the Settings modal. |
| `js/export.js` | JSON and Markdown export. |
| `js/state.js` / `js/dom.js` / `js/utils.js` / `js/theme.js` / `js/view.js` / `js/main.js` | State, DOM plumbing, helpers, appearance, mounting and boot. |

Conventions: one responsibility per file, a `'use strict'` header, a comment block
explaining *why* the file exists, and markup carried in the module that owns it.

## License

See [LICENSE](LICENSE).

Interviwer photo by [Vitaly Gariev](https://www.pexels.com/photo/confident-young-woman-with-glasses-outdoors-36712866/)
