# Changelog

All notable changes to Learn Lang Tool are documented in this file.

## 1.0.3 - 2026-08-02

### Improvements

- Prefer Google pronunciation in Google Translate mode, with Kokoro and Web Speech fallbacks.
- Reuse validated pronunciation audio for Anki and keep queued audio retries durable across restarts.
- Preserve Bergamot's no-Google privacy boundary and expose accessible preparation, failure, and retry states.

## 1.0.2 - 2026-08-02

### Improvements

- Play translated text directly from the translation popover and browser popup.
- Use a browser or operating-system voice matching the configured target language.
- Keep original and translated playback coordinated so only one plays at a time.

## 1.0.1 - 2026-07-31

### Improvements

- Open extension settings in a dedicated browser tab with a new responsive visual design.
- Compare queued Anki cards with existing notes and decide whether to skip or add duplicates.
- Keep offline queue state and synchronization feedback clearer when Anki is unavailable.

## 1.0.0 - 2026-07-26

First release of the browser extension.

### Highlights

- Translate selected text and words directly on a page with a translation popover.
- Use Google Translate by default or install the Bergamot `en → ru` model pack for offline translation.
- Save translation results to a local Anki queue and synchronize them through AnkiConnect.
- Export queued cards as TSV or CSV for manual import.
- Generate English pronunciation locally with Kokoro and attach audio to Anki cards.
- Handle selections from regular web pages, Google Docs, YouTube subtitles, and the built-in PDF viewer.
- Configure the language pair, translation provider, hotkey, Anki connection, and pronunciation settings.
