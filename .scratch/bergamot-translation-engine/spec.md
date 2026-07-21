# Bergamot as product translation engine

**Status:** ready-for-agent

## Problem Statement

Learners want to highlight phrases on any web page, get a translation immediately, and later save those phrases for study — without installing or running a separate translation server. Today the extension depends on an HTTP translation backend (Fastify + Argos), so a normal user cannot use the product offline or with zero infra. Dictionary-style tools like Yomitan excel at word lookup from local dictionaries, but this product needs phrase-capable machine translation that still runs on the user’s machine.

## Solution

Switch the product translation path to an on-device **translation engine** (Bergamot / Marian WASM) inside the Chrome extension. The user explicitly downloads a **model pack** for their **language pair** once; after that, **translation requests** complete offline and show results in the **translation popover**. The optional translation backend stays in the monorepo for development/future use but is not required at runtime. The text sent for translation is exactly the **selection** or word under the cursor; a **context sentence** is captured separately for a future Anki track.

## User Stories

1. As a learner, I want to translate a highlighted phrase on any page without a remote server, so that my reading stays private and works without my backend.
2. As a learner, I want to translate the word under the cursor with hold-to-translate, so that I can look up words without selecting them first.
3. As a learner, I want phrase translation to send only what I selected, so that I learn the exact collocation I chose.
4. As a learner, I want word translation to send only the word, so that I don’t get a whole-sentence translation when I meant a single word.
5. As a learner, I want the surrounding context sentence kept with the lookup, so that a future Anki card can show where the word/phrase appeared.
6. As a learner, I want a translation popover next to my selection, so that I stay in the reading flow.
7. As a learner, I want to see loading, success, and error states in the popover, so that I know what the extension is doing.
8. As a learner, I want the default language pair to be English → Russian, so that I can start without configuring anything.
9. As a learner, I want language pair settings to remain configurable, so that I can change direction when we add more model packs.
10. As a learner, I want the architecture to allow adding another language pair (e.g. Spanish) later without redesigning the product flow, so that the tool can grow with me.
11. As a first-time user, I want an explicit prompt before downloading a model pack, so that I am not surprised by a large download.
12. As a first-time user, I want to see approximate download size before consenting, so that I can decide on metered networks.
13. As a first-time user, I want a clear CTA in the popover when no model pack is installed, so that I know how to enable translation.
14. As a returning user, I want translation to work fully offline after the model pack is installed, so that I can learn without network access.
15. As a returning user, I want the model pack to persist across browser restarts, so that I only download once.
16. As a learner, I want no silent fallback to a remote API when the engine fails, so that I always know whether translation is local.
17. As a learner, I want a clear error if the translation engine crashes or times out, so that I can retry or reinstall the model pack.
18. As a learner, I want oversized selections to be rejected with a clear message (within an agreed character limit), so that the UI stays responsive.
19. As a learner, I want aborting a in-flight translation (e.g. dismissing / new hotkey) to cancel work, so that stale results don’t overwrite newer ones.
20. As a Chrome user, I want the feature to work in Manifest V3 Chrome first, so that I can use the primary supported browser.
21. As a privacy-conscious user, I want selection text never sent to our servers for translation, so that my reading content stays on my device.
22. As a privacy-conscious user, I want model pack downloads to fetch only binary assets, so that consenting to download does not upload my text.
23. As a developer, I want apps/api and apps/translator to remain in the monorepo, so that the optional translation backend is still available for experiments.
24. As a developer, I want the product happy path to run without starting those services, so that local extension development matches the end-user architecture.
25. As a developer, I want inference outside the content script (offscreen document + worker), so that page UIs stay responsive and WASM isn’t duplicated per tab carelessly.
26. As a developer, I want the content script to call a single translation facade, so that UI code does not know about Bergamot internals.
27. As a developer, I want extractTextTarget behavior preserved, so that word vs phrase modes and context sentence capture stay correct.
28. As a learner, I want successful translations to be Anki-eligible in the result shape, so that a later Anki track can offer save-with-edit without reworking the engine.
29. As a learner, I do not need working “Add to Anki” in this release, so that translation can ship without waiting on AnkiConnect.
30. As a learner, I want hold-to-translate and language pair settings to keep working as today, so that the migration does not regress core UX.
31. As a user on a failed download, I want to retry installing the model pack, so that a flaky network doesn’t permanently block me.
32. As a user who cancels a model pack download, I want translation to remain disabled until I install it, so that partial installs don’t produce mysterious failures.
33. As a maintainer, I want README/docs to describe the local Bergamot product path, so that contributors don’t assume the API is required.
34. As a maintainer, I want ADR 0001 respected, so that agents don’t reintroduce a required remote translator for the product path.

## Implementation Decisions

- Respect ADR `0001-bergamot-as-translation-engine`: Bergamot is the product translation engine; optional translation backend is not on the required runtime path.
- Primary module seam: a single **translation facade** in the extension that accepts a Translation request and returns a Translation result (or typed failures). Content script / popover talk only to this seam.
- Replace the product use of the HTTP translation API client with a Bergamot-backed implementation behind that facade. Keep the optional backend code in the monorepo; do not delete it in this workstream.
- Remove required `host_permissions` / hardcoded product dependency on `API_BASE_URL` for the happy path. Extension must translate with only local engine + installed model pack.
- Run Bergamot inference in an offscreen document (or equivalent MV3 pattern) with a dedicated worker; content script handles selection, hold-to-translate, popover UI, and messaging only.
- Model pack lifecycle: detect missing pack → user-visible consent (options and/or popover CTA) → download → persist → mark ready. Support retry after failure; no silent partial use.
- v1 model pack: `en → ru`. Registry / naming of model packs must allow additional pairs later without changing the Translation request/result contract.
- Preserve `extractTextTarget`: phrase mode uses selection text; word mode uses word under cursor; context sentence is attached for future Anki, not as translation engine input unless the user selected that sentence.
- Enforce a maximum translation text length (prefer a learner-friendly cap in the 500–2000 character range; reject above with a clear popover error). Align shared validation with this product limit.
- Typed facade errors at minimum: model pack missing/not ready, engine failure, text too long, aborted. Map these to popover messages and CTAs (especially install model pack).
- No remote fallback translator in the product path when local translation fails.
- Chrome-only for this spec. Firefox adaptations are out of scope.
- Anki UI/actions remain out of this implementation track; keep `can_add_to_anki` in the Translation result contract for forward compatibility (may be true after successful local translate per prior product decision, even if the button wiring stays later).
- Selection / source text must not leave the device for translation. Network use is limited to downloading model pack binaries (and extension updates).
- Update product-facing docs (README) so local Bergamot is described as the primary path; optional backend documented as optional.
- Shared package types (`TranslateRequest` / `TranslateResponse` / language pair defaults) remain the cross-cutting contract where useful; extend only if model-pack status needs a shared type — prefer keeping engine-specific types inside the extension.

## Testing Decisions

- Good tests assert external behavior of a module: given inputs and fakes at the boundary, observe outputs/errors. Do not assert Bergamot WASM internals, worker message framing, or file layout of model binaries.
- **Primary tested module: the translation facade.** With a fake/in-memory engine double, verify success mapping to Translation result, model-pack-missing error, engine failure, abort passthrough, and oversized text rejection.
- Keep and extend prior art: existing vitest suites for the translation client and `extractTextTarget` / `normalize-text`. Prefer evolving the translation-client tests into facade tests rather than adding a second parallel suite.
- `extractTextTarget` remains tested for phrase vs word mode and context sentence capture; do not regress those behaviors when wiring the engine.
- Do not require CI to download real Bergamot model packs or run WASM integration in unit tests. Optional manual / smoke checklist for real model download + offline translate is acceptable outside automated unit tests.
- Prefer the highest seam: facade behavior over offscreen plumbing tests. Add narrower tests only if a pure helper appears (e.g. model pack readiness pure logic) and cannot be covered through the facade.

## Out of Scope

- AnkiConnect / Add to Anki flow, card templates, and edit-before-save UI (separate track).
- Firefox / non-Chrome browsers.
- Deleting or rewriting `apps/api` and `apps/translator`.
- Cloud MT, LLM translation, Transformers.js, or hybrid quality tiers.
- Bundling model packs inside the extension package for Web Store size reasons.
- Shipping additional language pairs beyond `en → ru` (architecture must allow them; shipping them is later).
- Telemetry that uploads selection text or translation contents.
- Performance tuning beyond “usable on a typical laptop for short phrases.”
- Full redesign of options UI beyond what is needed for model pack consent/status.

## Further Notes

- Domain vocabulary: use CONTEXT.md terms (translation popover, selection, language pair, translation request/result, translation engine, model pack, context sentence, phrase/word translation, hold-to-translate, optional translation backend). Avoid calling the product path “the API.”
- Quality trade-off is explicit: local Bergamot will lag DeepL/LLM on slang and technical jargon; accepted for privacy and zero required infra.
- Issue tracker for this repo publish: local markdown under `.scratch/` (GitHub remote exists but was not used due to broken `gh` auth at publish time).
- Suggested follow-ups after this spec: to-tickets for tracer-bullet implementation; later Anki spec that consumes context sentence + Anki-eligible results.
