# 03 — Offscreen translation path with stub engine

**What to build:** With a ready model pack, the learner’s translation request goes content script → translation facade → offscreen/worker path and returns a Translation result from a deterministic stub engine (no Bergamot WASM yet). Missing pack yields a typed error and install CTA — no silent fallback to the HTTP optional backend on this local path. Demoable end-to-end local pipeline without running apps/api or apps/translator.

**Blocked by:** 01 — Prefactor: translation facade; 02 — Model pack consent, download, and readiness (en→ru)

**Status:** resolved

- [ ] When the model pack is ready, hold-to-translate / selection translate completes via the offscreen (or equivalent MV3) path and shows a stub Translation result in the translation popover
- [ ] When the model pack is missing/not ready, the facade returns a typed model-pack error mapped to popover CTA — no silent HTTP fallback on this path
- [ ] Content script does not run inference; heavy work stays outside the page content script
- [ ] Phrase vs word text sent to the facade remains exactly selection or word under cursor; context sentence is still captured client-side for later Anki (not sent as engine text unless selected)
- [ ] In-flight translate can be aborted without applying a stale result
