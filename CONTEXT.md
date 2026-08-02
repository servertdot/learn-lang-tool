# Learn Lang Tool

Browser extension for in-context language learning: translate selections on the page, and later save phrases to Anki. Product translation runs locally in the extension; an optional HTTP translation backend may exist in the monorepo but is not part of the required runtime.

## Language

**Translation popover**:
A floating card shown near the user's text selection, displaying the translation and the original text below.
_Avoid_: popup, tooltip, modal

**Selection**:
The text the user has highlighted on a web page before invoking translation.
_Avoid_: query, lookup target

**Language pair**:
The configured source (`from_code`) and target (`to_code`) languages for translation. v1 ships `en → ru`; the model must allow adding further pairs later without redesigning the product flow.
_Avoid_: locale pair, direction

**Translation request**:
A request to translate a selection or the word under the cursor using the configured language pair. The text sent for translation is exactly that selection or word — not an expanded sentence.
_Avoid_: lookup, query

**Translation result**:
The outcome of a translation request: original text, translated text, language codes, and whether the item is Anki-eligible.
_Avoid_: translation response, lookup result, API response

**Translation engine**:
The on-device runtime inside the extension that fulfills translation requests (product path).
_Avoid_: translator service, API, backend translator

**Model pack**:
The downloadable assets for one language pair that the translation engine needs before it can translate. Installed with explicit user consent; after install, translation works offline.
_Avoid_: dictionary, language pack (ambiguous with UI i18n)

**Context sentence**:
The surrounding sentence captured alongside a word or phrase for later Anki use. It is not sent to the translation engine unless the user selected that sentence themselves.
_Avoid_: context, surrounding text, example sentence

**Anki-eligible**:
A translation result where `can_add_to_anki` is true, meaning the user may save it as a flashcard (after optional edit). Anki integration itself is a separate track from the translation engine.
_Avoid_: anki-ready, cardable

**Phrase translation**:
Translation mode where the user has explicitly selected multiple words; the selection itself is the translation request text.
_Avoid_: multi-word lookup

**Word translation**:
Translation mode where the user selects a single word or has nothing selected but holds the hotkey; the word under the cursor is the translation request text, and the context sentence is captured separately for Anki.
_Avoid_: hover translation, auto-detect translation

**Language pair settings**:
User-configurable `from_code` / `to_code` pair stored in `chrome.storage.sync`; defaults to `en → ru`.
_Avoid_: locale settings, language config

**Hold-to-translate**:
The interaction where the user holds a configured hotkey while text is selected or the cursor is over a word; the translation popover is shown while the key is held and dismissed on release.
_Avoid_: press-to-translate, toggle translate

**Optional translation backend**:
HTTP translation services kept in the monorepo for development or future use, not required for the product translation path.
_Avoid_: required API, primary translator

**Speech model pack**:
The downloadable speech assets (model weights, tokenizer, and related data) for a TTS provider revision. Installed with explicit user consent, separately from translation model packs; after install, pronunciation works offline.
_Avoid_: voice pack, language pack (ambiguous with UI i18n), Kokoro download (provider-specific)

**Pronunciation request**:
A provider-neutral description of what should be synthesized: exact source text, normalized speech language, provider identity/revision, voice, speed, and encoding version. Queue entries retain the request so artifacts can be recreated without storing audio bytes in the queue.
_Avoid_: TTS job, synthesis recipe (informal), utterance payload

**Pronunciation artifact**:
The encoded audio bytes plus metadata produced for a pronunciation request (MIME type, extension, sample rate, deterministic filename/key, and effective voice/speed). Preview playback and Anki media use the same artifact.
_Avoid_: audio blob, media file, WAV (format-specific)

**TTS provider**:
The capability that converts a pronunciation request into a pronunciation artifact. Kokoro is the initial provider; the product selects by source language through a provider-language registry.
_Avoid_: speech engine, voice API, synthesizer service

**Pronunciation policy**:
The ordered TTS providers authorized for exact text, language, active translation provider, and purpose. Preview policy may end with Web Speech; Anki policy contains artifact-capable pronunciation requests only and is persisted without later adding a newly remote provider.
_Avoid_: fallback list, TTS cascade, provider chain (when referring to the durable policy)
