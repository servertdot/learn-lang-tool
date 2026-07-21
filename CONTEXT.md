# Learn Lang Tool

Monorepo for language learning: browser extension for in-context translation, Fastify API, and Anki integration.

## Language

**Translation popover**:
A floating card shown near the user's text selection, displaying the translation and the original text below.
_Avoid_: popup, tooltip, modal

**Selection**:
The text the user has highlighted on a web page before invoking translation.
_Avoid_: query, lookup target

**Language pair**:
The configured source (`from_code`) and target (`to_code`) languages for translation.
_Avoid_: locale pair, direction

**Translation request**:
A request to translate a selection using the configured language pair.
_Avoid_: lookup, query

**Translation result**:
The response from the API containing the original text, translated text, language codes, and whether the item can be added to Anki.
_Avoid_: translation response, lookup result

**Anki-eligible**:
A translation result where `can_add_to_anki` is true, meaning the user may save it as a flashcard.
_Avoid_: anki-ready, cardable

**Phrase translation**:
Translation mode where the user has explicitly selected multiple words; the selection itself is sent as `text`, with no context expansion.
_Avoid_: multi-word lookup

**Word translation**:
Translation mode where the user selects a single word or has nothing selected but holds the hotkey; the word under the cursor is detected, and the surrounding sentence is captured for context.
_Avoid_: hover translation, auto-detect translation

**Language pair settings**:
User-configurable `from_code` / `to_code` pair stored in `chrome.storage.sync`; defaults to `en → ru`.
_Avoid_: locale settings, language config

**Hold-to-translate**:
The interaction where the user holds a configured hotkey while text is selected or the cursor is over a word; the translation popover is shown while the key is held and dismissed on release.
_Avoid_: press-to-translate, toggle translate
