# Privacy Policy — Reaction Learner

**Last updated:** <!-- set the date you publish this -->

Reaction Learner is a Chrome extension that helps you study a text by reacting to
it from memory and having an AI evaluate your understanding. This policy explains
exactly what happens to your data. It is short because the extension has no
backend: there is no account system, no analytics, and no server of ours
anywhere.

## Summary

- Nothing is sent to us. We operate no servers and receive no data.
- Your source text, reactions and evaluations live in the tab's memory and are
  gone when you close it.
- Your API keys are stored only in your own browser, and are sent only to the AI
  provider you chose. In the extension that is a storage area private to it; in a
  plain browser tab it is the browser's `localStorage` for that page's origin.
- Two things leave your machine, and only when you ask for them: a request to
  your chosen AI provider when you run an evaluation, and — if you use voice
  input — your microphone audio to Google for transcription.

## What the extension handles

### API keys

Reaction Learner is "bring your own key": you paste an API key for an AI provider
(OpenAI, Anthropic, Google, DeepSeek, Moonshot or Mistral). A key is:

- **read** from the Settings field when you run an evaluation;
- **stored** only when you press Save, so you enter a key once instead of on every
  visit. In the extension that is `chrome.storage.local` — this extension's own
  private storage area, which websites and other extensions cannot read. In a
  plain browser tab it is the browser's `localStorage` for that page's origin,
  which any page on the same origin can read; the extension is the more private
  option for that reason. If you never press Save, the key is never written
  anywhere;
- **sent** only to that provider's API endpoint, as the `Authorization` header of
  the request you asked for. It is never sent to us or to any other party.

Pressing **Forget saved keys** deletes every stored key from your browser, in
either build. Uninstalling the extension removes the extension's storage, and
clearing site data removes the browser-tab copy.

### Source text and reactions

Source text is loaded in one of three ways, all under your control:

- you paste it yourself, or
- you type an address into the **Enter URL** tab, which opens that page in a
  background tab, reads its readable text, and closes the tab again. This needs
  your approval for that one site — Chrome asks the first time you load it, and
  you can revoke it at any time — or
- you click the extension's toolbar icon on a page, which reads that page's
  readable text using Chrome's `activeTab` permission. This happens only at the
  moment you click; the extension has no standing access to your browsing.

In every case the text is taken from the page in your own browser and is never
sent to us — we operate no server that could receive it.

Source text, the paragraph you marked, your written reactions and the AI's
evaluations are held **in memory only**, in the running page. They are not stored
anywhere and not transmitted anywhere, except that:

- when you press **Send**, the portion of the source text up to your marker is
  sent to your chosen AI provider as context for the evaluation, together with
  your reaction; and
- when you use **Export**, a JSON or Markdown file is generated in your browser
  and saved wherever your browser saves downloads. That file contains the source
  text, your reactions and the evaluations. Where it goes afterwards is up to you.

### Voice input

Voice input uses the browser's built-in `SpeechRecognition` API. No account and
no API key are involved, and the extension stores nothing.

Be aware that in Chrome this API is a **server-side** recogniser: your microphone
audio is streamed to Google to be transcribed. Dictation does not work offline.
This is Chrome's behaviour, not something the extension controls, and it is the
reason the extension asks for microphone permission. If you would rather not send
audio anywhere, type your reaction instead — everything else in the extension
stays on your machine. Text-to-speech (Read aloud) is fully local and uses the
voices already installed on your computer.

## What we never do

- We never collect, receive or have access to your data.
- We do not sell or transfer your data to third parties.
- We do not use your data for advertising, profiling, or creditworthiness.
- We do not use your data for any purpose unrelated to the extension's single
  purpose of evaluating your reactions to a text you loaded.
- No human reads your data, because we never receive it.

This use of data complies with the Chrome Web Store User Data Policy, including
the Limited Use requirements.

## Third parties

Your data reaches a third party only through an action you take:

| When | What is sent | To |
| --- | --- | --- |
| You run an evaluation | The source text up to your marker, and your reaction | The AI provider whose key you entered |
| You use voice input | Microphone audio | Google (via Chrome's `SpeechRecognition`) |
| You export a session | Nothing | Nobody — the file is written locally |

Each provider handles that data under its own privacy policy. The relevant ones
are: [OpenAI](https://openai.com/policies/privacy-policy),
[Anthropic](https://www.anthropic.com/legal/privacy),
[Google](https://policies.google.com/privacy),
[DeepSeek](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html),
[Moonshot AI](https://platform.moonshot.ai/docs/agreement/privacy) and
[Mistral AI](https://mistral.ai/terms#privacy-policy).

## Retention and deletion

We retain nothing. Source text, your marked position and your reactions live in
the page and disappear when you close the tab.

Saved settings — your API keys, chosen provider, chosen models and appearance —
persist until you erase them, so you enter a key once rather than on every visit.
They are removed by **Forget saved keys** in Settings, which erases the keys and
leaves your other preferences standing. Uninstalling the extension removes
everything it stored; clearing site data does the same for the browser-tab build.
Exported files are yours to delete.

In the extension those settings live in `chrome.storage.local`, a storage area
private to the extension. In a plain browser tab (the hosted page, or
`index.html` opened from disk) they live in the browser's `localStorage` for that
origin — which means any other page served from the same origin can read them.
That is the reason the extension exists as the more private option.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Read the current page's text, only after you click the toolbar icon |
| `scripting` | Extract that page's readable text at the moment you click, and read a page you loaded through **Enter URL** |
| `storage` | Save your API keys, chosen provider, model and appearance, locally |
| Host access to the six AI provider endpoints | Send your evaluation request to the provider you selected |
| **Optional** host access to sites | Only if you use **Enter URL**, and only for the sites you approve in Chrome's prompt |

The one permission that could grant access to websites is declared **optional**.
It is not granted when you install or update the extension. It is requested only
when you press **Load text** in the **Enter URL** tab, one origin at a time, and
each grant can be revoked individually in `chrome://extensions` without
uninstalling. If you never use **Enter URL**, the extension never holds access to
any site beyond the one you clicked on with the toolbar icon.

When you do approve a site, what happens is narrow and inspectable:
`background.js` opens the exact address you typed, runs one function that reads
`article`/`main`/`body` text, and closes the tab again. Nothing is fetched unless
you press **Load text**, and there is no background scanning and no history
access.

The extension executes no remote code — every line of it ships inside the
package.

## Children

The extension is not directed at children and does not knowingly collect
information from anyone.

## Changes

If this policy changes, the updated version will be published at this URL with a
new "last updated" date. Material changes will also be noted in the extension's
release notes.

## Contact

Questions or concerns: please open an issue at
<https://github.com/codehithesh/Reaction-Learner/issues>.
