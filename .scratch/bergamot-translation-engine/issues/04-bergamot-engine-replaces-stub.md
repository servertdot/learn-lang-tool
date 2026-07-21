# 04 — Bergamot engine replaces stub

**What to build:** With the en→ru model pack installed, the learner gets real offline phrase and word translations in the translation popover via Bergamot, with no requirement to run the optional translation backend. Stub engine is replaced for the product path.

**Blocked by:** 03 — Offscreen translation path with stub engine

**Status:** resolved

- [ ] Ready en→ru model pack + hold-to-translate/selection yields a real Bergamot Translation result (source + translated text + language codes) in the popover
- [ ] Translation works with network disabled after the pack is installed (offline happy path)
- [ ] Product happy path does not require apps/api or apps/translator to be running
- [ ] Engine/load failures surface as clear popover errors (still no silent HTTP fallback)
- [ ] Selection/source text is not uploaded for translation; network use for this feature is limited to model pack download
