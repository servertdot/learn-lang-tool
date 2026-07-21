# 01 — Prefactor: translation facade

**What to build:** Learners still translate via hold-to-translate as today, but the extension’s product code only talks to a single translation facade. The optional HTTP backend remains available behind that facade as an adapter. Facade behavior is covered by tests with a fake engine (success, failure, abort).

**Blocked by:** None — can start immediately.

**Status:** resolved

- [ ] Content script / product UI obtains Translation results only through the translation facade, not by calling the HTTP client directly
- [ ] An HTTP adapter behind the facade still fulfills translation when that path is selected (no user-facing regression vs current API-backed flow)
- [ ] Facade tests with a fake engine cover success → Translation result, failure → typed error, and AbortError passthrough
- [ ] Existing hold-to-translate, language pair settings, and extractTextTarget phrase/word + context sentence behavior remain intact
