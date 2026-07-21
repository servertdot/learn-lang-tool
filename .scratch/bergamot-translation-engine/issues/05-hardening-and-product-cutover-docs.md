# 05 — Hardening and product cutover docs

**What to build:** The local Bergamot path feels production-safe for Chrome learners: oversized selections are rejected clearly, engine/abort errors are well mapped, successful results are Anki-eligible in shape (no Anki UI required), the extension no longer depends on localhost API permissions for the product path, and README describes Bergamot as primary with the HTTP stack as optional.

**Blocked by:** 04 — Bergamot engine replaces stub

**Status:** resolved

- [ ] Texts over the agreed max length are rejected with a clear popover message before/at the facade
- [ ] Typed facade errors (engine failure, abort, model pack missing, too long) map to distinct, understandable popover UX
- [ ] Successful local Translation results set Anki-eligible appropriately for a future Anki track (Add to Anki flow still out of scope)
- [ ] Product extension config/manifest no longer requires the optional translation backend host for the happy path
- [ ] README (and any needed contributor notes) describe local Bergamot as the primary path and api/translator as optional
