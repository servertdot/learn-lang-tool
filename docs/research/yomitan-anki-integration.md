# Yomitan: Anki integration and dictionary architecture

Research target: Yomitan at commit [`ddbe4a2c`](https://github.com/yomidevs/yomitan/tree/ddbe4a2c), plus current first-party documentation where it clarifies user-visible behavior.

## What the `+` button does

- Yomitan requires desktop Anki to be running with the AnkiConnect add-on. The add icon is absent or disabled when the integration or selected deck/model is unavailable. Clicking the normal add icon creates the note immediately; the documented flow does not open Anki's editor or focus the new note ([Yomitan Anki guide](https://yomitan.wiki/anki/#flashcard-creation), [getting started](https://yomitan.wiki/getting-started/#export-flashcards-to-anki)).
- Yomitan lets the user select an existing Anki deck and model and map model fields to semantic markers such as `{expression}`, `{glossary}`, `{sentence}`, `{audio}`, `{url}`, and `{document-title}`. The model is therefore user-owned; Yomitan renders data into its fields ([field configuration and markers](https://yomitan.wiki/anki/#flashcard-configuration)).
- Duplicate behavior is configurable. Yomitan can preflight candidates and change/disable the add icon; Anki itself normally treats the model's first field as the uniqueness field ([Yomitan duplicate notes](https://yomitan.wiki/anki/#flashcard-creation)).

## AnkiConnect capabilities relevant to this project

AnkiConnect exposes a local JSON API. Its implementation supports:

- `addNote`: immediately persist a note and return its note ID;
- `canAddNotes`: validate candidates before enabling the button;
- `deckNames`, `modelNames`, and `modelFieldNames`: populate setup controls;
- `guiAddCards(note)`: open and focus Anki's Add Cards window with a prefilled unsaved note;
- `guiEditNote(noteId)`: open an already-created note for editing;
- `guiBrowse("nid:<id>")`: open the browser filtered to a created note;
- media on a note through `audio`, `picture`, and `video`; audio is downloaded/stored and a `[sound:filename]` reference is appended to the configured field;
- `requestPermission`: ask the user to authorize the browser-extension origin instead of requiring a wildcard CORS configuration.

Primary implementation: [AnkiConnect `plugin/__init__.py`](https://github.com/FooSoft/anki-connect/blob/master/plugin/__init__.py). The historical GitHub repository is archived and points to the current upstream, but the API implementation documents the actions used by Yomitan-style integrations.

This gives three distinct product flows:

1. `addNote` — Yomitan-like one-click background add.
2. `guiAddCards` — review a prefilled note in Anki before saving.
3. `addNote`, then `guiEditNote` — save immediately and focus the saved note.

## Audio is a separate provider

Yomitan checks configured pronunciation sources and can export downloadable audio to Anki. Browser `SpeechSynthesis` voices can be used for preview but cannot be exported to Anki ([Yomitan audio documentation](https://yomitan.wiki/advanced/#audio)). Its ordinary audio feature is pronunciation of the dictionary term, not capture of arbitrary audio from the source web page.

For selected phrases in Learn Lang Tool, exportable audio therefore needs its own source: a downloadable pronunciation URL, server-side TTS, or bytes fetched by the extension and sent to AnkiConnect as base64. Argos Translate supplies no audio.

## Dictionary pipeline in Yomitan

- Dictionaries are downloaded/imported by the user; lookup is unavailable until at least one dictionary is imported ([Yomitan dictionaries](https://yomitan.wiki/dictionaries/)).
- Imported data is stored locally in the extension profile using IndexedDB ([Yomitan support](https://yomitan.wiki/support/#im-having-problems-importing-dictionaries-in-firefox-what-do-i-do)). The source-level responsibilities are split between import/validation, the IndexedDB dictionary database, language-specific text transforms/deinflection, lookup/result grouping, and display.
- A lookup may require many candidate database queries because inflected text is expanded into possible base forms; this is why Yomitan explicitly favors local dictionaries over network scraping ([Yomitan support: online dictionaries](https://yomitan.wiki/support/#will-you-add-support-for-online-dictionaries)).
- The dictionary result is richer than a translation string: headword, reading, definitions, tags, frequencies, pronunciation metadata, and dictionary attribution can all feed the popup and Anki marker renderer ([Yomitan Anki markers](https://yomitan.wiki/anki/#flashcard-configuration)).

The architectural idea is reusable, but copying implementation code is not neutral: Yomitan is [`GPL-3.0-or-later`](https://github.com/yomidevs/yomitan/blob/ddbe4a2c/LICENSE). A separately implemented provider interface and independently written importer/query layer are the conservative route if this project remains under a different license. Individual dictionary datasets also have their own licenses.

## Fit with Learn Lang Tool

The requested first card needs no dictionary subsystem. It can be built from a captured selection snapshot and the existing machine-translation result:

- selected text;
- translated text;
- containing sentence and selection offsets;
- page URL/title;
- optional separately generated audio.

What is currently missing locally:

- phrase mode discards sentence context in `extract-text-target.ts`;
- content state keeps only the translation response, so context must be snapshotted before the user clicks `+`;
- the shared response puts `can_add_to_anki` on the translation API, while reachability/configuration of a local Anki instance is a client-side concern;
- the background entry point exists but is empty; it is the correct boundary for AnkiConnect calls;
- the manifest has no AnkiConnect loopback host permission yet;
- there is no deck/model/field mapping, duplicate policy, permission handshake, or audio provider.

Recommended boundary:

```text
page selection -> SelectionSnapshot -> translation API
                              |              |
                              +--> CardDraft-+
                                      |
content UI --runtime message--> extension background --HTTP--> AnkiConnect
```

Keep machine translation and dictionary lookup as separate providers. Add a dictionary provider only when the product needs lemma/readings/multiple definitions/frequencies rather than merely selection/translation/context.
