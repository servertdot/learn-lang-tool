# Learn Lang Tool (LLT)

LLT is a browser extension for learning languages in context. Select a word, phrase, or sentence on any page to translate it instantly, then save it to Anki without leaving what you are reading.

The goal is to help you learn expressions in the context where you found them—not as isolated dictionary entries.

## Features

- Translate selected text directly on the page.
- Open the toolbar translator to type or paste text, choose source and target languages, and copy the result.
- Translate the word under the cursor with a hold-to-translate hotkey.
- Use Google Translate by default for translation quality.
- Switch to local Bergamot translation for a private, offline `en → ru` workflow.
- Save the original text, translation, and context sentence to a local Anki queue.
- Synchronize queued cards through AnkiConnect or export them as TSV/CSV.
- Generate pronunciation with Google TTS or local Kokoro and attach original-text audio to Anki cards.
- Play original and translated text through Google TTS, Kokoro, and Web Speech fallbacks.
- Capture text from regular web pages, Google Docs, YouTube subtitles, and the built-in PDF viewer.
- Configure the language pair, translation provider, hotkey, Anki connection, and pronunciation settings.

## How LLT works

1. Select text on a page, or hold the configured hotkey over a word.
2. LLT displays a translation popover next to the selection.
3. The background provider router sends the translation request to the selected provider.
4. Google Translate is used by default. In offline mode, Bergamot runs locally inside the extension.
5. **Add to Anki** stores the translation result in a local queue.
6. If Anki and AnkiConnect are available, LLT synchronizes the card immediately. Otherwise, it retries in the background.

```text
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Extension UI   │────▶│  Background      │────▶│  Google Translate  │
│  (popover)      │     │  provider router │     └────────────────────┘
│                 │◀────│                  │────▶ Offscreen / Bergamot
└─────────────────┘     └──────────────────┘
```

Google Translate receives the selected text when it is the active provider. With Bergamot, the model pack is downloaded with explicit consent and translation then works offline without sending selections to a translation service.

### Toolbar translator

Click the pinned extension icon to open a translator with Source and Target fields. Any selected page text is filled into Source and translated automatically into Target; otherwise the field starts empty. Edit, type, or paste up to 2,000 characters, choose the languages, and click **Translate** or press **Ctrl/⌘ + Enter** to translate again. Use the swap button to reverse the direction and **Copy** to copy the result. The context-menu **Translate selection** action still translates immediately; **Open translator** switches from that result to the translator with the original text filled in and translated automatically.

The translator starts with your configured language pair and uses your selected provider. Language changes in this window apply only to that session. Bergamot requires an installed model pack for the chosen pair.

### Special text sources

- **Google Docs:** an accessibility frame reads canvas selections and forwards them to the visible translation popover. The clipboard fallback restores the user's clipboard.
- **YouTube:** when there is no regular selection, the hotkey translates the current visible subtitle line.
- **Built-in PDF viewer:** select text and press the configured hotkey, or choose **Translate selection** from the context menu; the result opens in the extension popup.

## LLT and Yomitan

LLT is inspired by [Yomitan](https://github.com/yomidevs/yomitan), a mature language-learning extension with local dictionaries, frequency data, audio, and Anki export.

The main difference is focus: Yomitan excels at dictionary lookups, while LLT is designed around translating phrases and sentences as they appear on a page.

| | Yomitan | LLT |
|---|---|---|
| Translation source | Local dictionaries | Google Translate or local Bergamot |
| Primary strength | Rich word lookup | Phrases, collocations, and sentences |
| Anki workflow | Mature integration | Local queue and AnkiConnect synchronization |
| Required infrastructure | None | No server; AnkiConnect is only needed for automatic synchronization |

## Install a release

Download the latest build from [GitHub Releases](https://github.com/servertdot/learn-lang-tool/releases/latest).

### Chrome

1. Download and extract `learn-lang-tool-*-chrome.zip`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted directory.

### Firefox

1. Download and extract `learn-lang-tool-*-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on**.
4. Choose `manifest.json` from the extracted directory.

The Firefox package is currently a development build and must be loaded again after restarting the browser.

## Anki setup

For automatic synchronization:

1. Install the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on.
2. Create an `English` deck.
3. Use the `Basic (and reversed card)` note type with these fields:
   - `Word`
   - `Reading`
   - `Sentence`
   - `Meaning`
4. Start Anki and approve LLT when AnkiConnect requests access.

LLT connects to `http://127.0.0.1:8765` by default and adds the `yomitan` tag. Anki does not need to stay open: cards remain in the local queue and synchronize when it becomes available.

You can also export the queue as TSV/CSV and import it manually. After importing, remove those cards from the queue to prevent duplicate synchronization. AnkiConnect is not required when using export only.

## Local development

Requirements:

- Node.js
- pnpm 10.4.1

Install dependencies and start the Chrome development build:

```bash
pnpm install
pnpm --filter @app/extension dev
```

Load the unpacked extension from `apps/extension/dist_chrome`.

Google Translate is selected by default. To use offline translation, open LLT settings, select Bergamot, and download the `en → ru` model pack (approximately 15 MB).

### Verification

```bash
pnpm --filter @app/extension test
pnpm --filter @app/extension typecheck
pnpm --filter @app/extension lint
pnpm --filter @app/extension build:chrome
pnpm --filter @app/extension build:firefox
```

## Repository structure

```text
learn-lang-tool/
├── apps/
│   ├── extension/   # LLT browser extension
│   ├── api/         # Optional Fastify translation backend
│   └── translator/  # Optional FastAPI + Argos translation service
└── packages/
    └── shared/      # Shared translation contracts and defaults
```

`apps/api` and `apps/translator` are optional development and experimentation tools. They are not required for the extension's normal product path.

Run the optional backend:

```bash
pnpm --filter @app/translator models:install
pnpm --filter @app/translator dev   # http://localhost:8000
pnpm --filter @app/api dev          # http://localhost:3000
```

## Technology

- **Extension:** React 19, TypeScript, Vite, Tailwind CSS, Manifest V3
- **Translation:** Google Translate, Bergamot WASM
- **Pronunciation:** Google Translate web TTS, Kokoro, ONNX Runtime Web, Web Speech API
- **Anki:** AnkiConnect, TSV/CSV export
- **Optional API:** Fastify, TypeScript
- **Optional translator:** FastAPI, Argos Translate, Poetry
- **Monorepo:** pnpm workspaces

## Project documentation

- [`CONTEXT.md`](CONTEXT.md) — domain glossary
- [`docs/adr/0001-bergamot-as-translation-engine.md`](docs/adr/0001-bergamot-as-translation-engine.md) — original local-first translation decision
- [`docs/adr/0002-google-quality-provider.md`](docs/adr/0002-google-quality-provider.md) — Google as the default provider and Bergamot as the offline option
- [`CHANGELOG.md`](CHANGELOG.md) — release history
