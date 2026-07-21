# 02 — Model pack consent, download, and readiness (en→ru)

**What to build:** A first-time learner can explicitly consent to download the en→ru model pack (with approximate size), see progress/failure, retry or cancel, and end in a persisted “ready” or “not ready” state across restarts. When the pack is missing, the translation popover (and/or options) shows a clear install CTA. Until Bergamot lands, the HTTP adapter may still translate when the product path allows it — this ticket does not require offline MT yet.

**Blocked by:** 01 — Prefactor: translation facade

**Status:** resolved

- [ ] User must explicitly consent before any model pack download begins; approximate size is shown beforehand
- [ ] en→ru model pack can be downloaded, persisted, and reported as ready after success
- [ ] Failed download can be retried; cancelled/partial download does not leave the pack marked ready
- [ ] Readiness survives browser restart
- [ ] Missing/not-ready pack surfaces a clear CTA in the popover and/or options UI
- [ ] Model pack registry/naming allows additional language pairs later without changing Translation request/result shape
