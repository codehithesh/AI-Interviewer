# Privacy Policy — AI Interviewer

**Last updated:** 2025-09-11

AI Interviewer is a practice-interview app: you configure an interview, an AI
interviews you by voice, and you get an evaluation at the end. This policy explains
exactly what happens to your data. It is short because there is no backend — no
account system, no analytics, no server of ours anywhere. It is a static page you
load in your own browser.

## Summary

- **Nothing is sent to us.** We operate no servers and receive no data.
- **There is no transcript storage.** What you say lives in the tab's memory and is
  gone when you close it; export is the only way to keep a session.
- **Your API keys stay in your own browser** and are sent only to the AI provider you
  chose.
- **Your webcam video never leaves the browser.**
- **Your microphone audio is sent to Google for transcription** when you use voice
  input, by Chrome's own speech recogniser. That is the one place your audio leaves
  the machine.
- **What the AI sees** is what you send it: your answers, and the code you attach.

## What the app handles

### API keys

AI Interviewer is "bring your own key". You paste an API key for a provider (OpenAI,
Anthropic, Google, DeepSeek, Moonshot or Mistral). A key is:

- **read** from the Settings field when a request is made;
- **stored** only when you press **Save**, so you enter it once instead of on every
  visit. It goes to your browser's `localStorage` for this page's origin;
- **sent** only to that provider's own API endpoint, as the `Authorization` header of
  the request you asked for. It is never sent to us or to any other party;
- **never logged to the console, put in the URL, or rendered into the page** outside
  the password field that holds it.

Pressing **Forget saved keys** deletes every stored key from your browser and leaves
your other preferences standing. Clearing site data does the same thing more
thoroughly.

> **Be aware:** `localStorage` is scoped to an *origin*, not to a project. If this app
> is served from GitHub Pages at `<your-user>.github.io`, then **any other project
> under that same `<your-user>.github.io` origin can read what is stored here**,
> including a saved API key. That is a property of the web, not a choice this app
> makes, and the mitigation is the **Forget saved keys** button — or simply not
> pressing Save.

### The interview itself

Your answers are sent to the AI provider whose key you entered, because that is what
an AI interview is. Along with each answer the app sends the running conversation —
the interviewer's questions and your earlier answers — so the interviewer has context.
Only `message.content` from the provider's reply is read; any reasoning or
chain-of-thought field is discarded and never shown, logged or spoken.

Your **transcript, answers and evaluation are held in memory only**. They are never
written to `localStorage`, never uploaded anywhere else, and are gone when you close
the tab. **Export** is the only way to keep a session, and an exported file is written
locally by your browser — nothing is uploaded to produce it.

### Camera

`[Cam]` starts a **local self-view** with `getUserMedia({video: true, audio: false})`.
No audio track is requested, so the camera can never quietly become a second
microphone.

**The video never leaves your browser.** It is not recorded, not stored, not uploaded,
and never sent to any AI provider. Switching `[Cam]` off — or ending or restarting the
interview — stops the camera tracks outright.

The app does not enumerate your devices or read device labels before you grant
permission.

### Microphone

`[Mic]` uses the browser's built-in speech recognition
(`window.SpeechRecognition || window.webkitSpeechRecognition`). No third-party speech
service is involved and no key is needed for it.

**This is the one place your audio leaves the machine.** In Chrome, speech recognition
is a *server-side* recogniser: **microphone audio is streamed to Google to be
transcribed**, and dictation does not work offline. That is the browser's behaviour,
not a decision this app makes, and it is the reason the app cannot promise that voice
input stays local.

If you would rather nothing recorded your voice, type your answers instead — the
interview is fully usable without the microphone, and on browsers with no speech
recognition the mic button is disabled and the interview proceeds as type-only.

Read-aloud (text-to-speech) really is fully local: it uses your operating system's
voices through `speechSynthesis` and sends nothing anywhere. Interviewer messages are
read aloud locally only.

### Code you attach

The `[+]` code editor is a plain textarea. Code you insert becomes part of your
answer, and is therefore sent to your chosen AI provider along with the rest of that
answer when you send it. It is not stored anywhere else.

## What leaves your machine

| When | What is sent | To |
| --- | --- | --- |
| You start or answer an interview | Your answers, attached code, and the conversation so far | The AI provider whose key you entered |
| The interview ends | The full transcript | The same provider, for the evaluation |
| You use `[Mic]` | Microphone audio | Google (via Chrome's `SpeechRecognition`) |
| You press `[Cam]` | Nothing | Nobody — the self-view is local |
| You read a reply aloud | Nothing | Nobody — `speechSynthesis` runs locally |
| You export a session | Nothing | Nobody — the file is written locally |

Each provider handles that data under its own privacy policy. The relevant ones are:
[OpenAI](https://openai.com/policies/privacy-policy),
[Anthropic](https://www.anthropic.com/legal/privacy),
[Google](https://policies.google.com/privacy),
[DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html),
[Moonshot AI](https://platform.moonshot.ai/docs/agreement/privacy) and
[Mistral AI](https://mistral.ai/terms#privacy-policy).

## Retention and deletion

We retain nothing, because we receive nothing.

In the page: the transcript, your answers, the evaluation and any live camera stream
exist in memory for as long as the tab is open, and are gone when it closes. Nothing
about a session is written to storage, so there is nothing to delete.

In your browser's storage, only your **preferences** persist, so you are not
re-entering a key on every visit:

- API keys, one per provider;
- the chosen provider and the chosen model per provider;
- appearance (system / light / dark), the interview configuration (role, type,
  difficulty, duration, question cap, seed prompt), and the speech preferences (voice,
  rate, auto-speak).

**Forget saved keys** in Settings erases the keys and leaves the preferences standing.
Clearing your browser's site data removes all of it.

Exported files are yours, on your own disk, to delete.

## Children

This app is not directed at children and does not knowingly collect information from
anyone.

## Changes

If this policy changes, the updated version will be published at this URL with a new
"last updated" date.

## Contact

Questions or concerns: please open an issue at
<https://github.com/codehithesh/AI-Interviewer/issues>.
