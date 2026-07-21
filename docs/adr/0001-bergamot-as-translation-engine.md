# Bergamot as the product translation engine

**Status:** superseded by [ADR 0002](0002-google-quality-provider.md)

We will fulfill product translation requests with a local Bergamot (Marian WASM) translation engine inside the Chrome extension, not via the Fastify/Argos stack. Privacy and zero required infra outweigh peak MT quality (DeepL/LLM). `apps/api` and `apps/translator` stay in the monorepo as an optional translation backend but are removed from the required runtime. Inference runs outside the content script (offscreen document + worker). Model packs download on first use with explicit consent; after that, translation works offline. v1 language pair is `en → ru`, with the architecture open to more pairs later. No silent fallback to a remote API when the engine or model pack is missing. Anki integration is a separate track.

## Considered options

- Keep Argos via local/remote API as primary — rejected: forces a required backend for end users
- Transformers.js / NLLB in-extension — rejected for v1: heavier, weaker fit than Bergamot’s browser MT path
- Hybrid local preview + cloud for Anki quality — rejected for v1: conflicts with local-first; may revisit later
- Bundle model packs in the extension — rejected: store size; prefer download-on-first-use
