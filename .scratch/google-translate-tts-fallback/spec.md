# Google Translate TTS with Kokoro and Web Speech fallbacks

Status: ready-for-agent

## Problem Statement

Learners can now play both the original and translated text from a translation result, but the two paths have different limitations. Original-text pronunciation uses local Kokoro audio that can be reused by Anki, while translated-text playback uses the browser's Web Speech implementation and therefore varies by browser, operating system, and installed voices. A learner reading English articles while learning Spanish wants a more consistent target-language voice and wants the same higher-quality remote audio to be reusable for the existing original-text Anki pronunciation when possible.

The unofficial Google Translate TTS endpoint appears able to return encoded speech without a paid Cloud TTS account, but it is undocumented and may reject extension traffic, impose unknown limits, change its request contract, or disappear. The product therefore needs an explicit feasibility gate, a provider-neutral fallback chain, strict remote-data rules, and a durable Anki path that never silently creates a note without required audio.

## Solution

When Google Translate is the active translation provider, use the fixed unofficial Google Translate TTS endpoint as the primary TTS provider for both original- and translated-text preview. If Google TTS cannot produce or play valid audio, fall back to an already available compatible Kokoro provider, then to Web Speech for preview-only playback. When Bergamot is active, never send text to Google TTS: use Kokoro when compatible and available, then Web Speech for preview.

Preserve the current Anki meaning: only the exact original text receives pronunciation audio. In Google translation mode, attempt to attach a Google pronunciation artifact first and fall back to a Kokoro pronunciation artifact. In Bergamot mode, use Kokoro only. Web Speech is never an Anki audio source because it does not expose reusable encoded bytes. If no artifact-capable provider succeeds, keep the card visibly waiting or failed rather than silently synchronizing it without audio.

Long text is split on sentence and word boundaries into bounded Google requests, then assembled in order into one validated pronunciation artifact. Preview-only artifacts live only for the active translation result. An artifact referenced by an Anki queue item is persisted and protected until synchronization completes.

## User Stories

1. As a learner, I want translated-text playback to prefer a Google target-language voice when I use Google Translate, so that pronunciation is more consistent than my browser's default voice.
2. As a learner reading English while studying Spanish, I want the Spanish translation spoken with the Spanish target-language code, so that I hear the language I am learning.
3. As a learner, I want original-text playback to prefer the same Google TTS source in Google translation mode, so that both sections have consistent remote playback behavior.
4. As a learner, I want Google TTS audio for the original text reused in Anki, so that review pronunciation matches what I heard in the translation result.
5. As a learner, I want Anki pronunciation to remain attached to the original text only, so that the meaning of my existing audio field does not change.
6. As a learner, I want translated-text audio to remain preview-only, so that this experiment does not require a second Anki audio field.
7. As a learner, I want Kokoro to take over when Google TTS fails and supports the requested language, so that a remote outage does not immediately remove pronunciation.
8. As a learner, I want Web Speech to take over when neither Google nor an installed compatible Kokoro provider can preview the text, so that the play action remains useful.
9. As a learner, I want Web Speech used only for preview, so that the product never pretends browser-managed speech is a reusable Anki artifact.
10. As a learner, I want a failed Google request to fall back automatically, so that I do not need to choose providers for every translation result.
11. As a learner, I want deliberate Stop actions to stop playback without starting another provider, so that stopping audio always means stop.
12. As a learner, I want Retry to begin the provider chain again after all providers fail, so that transient endpoint or playback problems are recoverable.
13. As a learner, I want only one original or translated pronunciation playing at a time, so that voices never overlap.
14. As a learner, I want starting a new translation result to stop and supersede older playback, so that stale speech is never associated with the new result.
15. As a learner, I want replay of Google audio within the same open translation result to reuse the fetched bytes, so that replay is immediate and avoids another endpoint request.
16. As a privacy-conscious learner using Bergamot, I want pronunciation to remain on Kokoro or Web Speech and never silently call Google TTS, so that selecting offline translation preserves its remote-service boundary.
17. As a Google Translate user, I want settings to disclose that original and translated text may be sent to Google's unofficial TTS endpoint, so that remote processing is not hidden.
18. As a learner, I want only the exact visible original or translated text sent for its corresponding pronunciation, so that the context sentence is not disclosed.
19. As a learner, I want the correct language code sent for each section, so that original text uses `from_code` and translated text uses `to_code`.
20. As a learner, I want long text spoken in the original order, so that chunking does not rearrange sentences or phrases.
21. As a learner, I want chunks split at natural sentence or word boundaries, so that speech does not introduce broken words.
22. As a learner, I want a failure in any Google chunk to discard the partial Google result and fall back for the complete text, so that one pronunciation never mixes unrelated voices.
23. As a learner, I want the assembled audio validated before it is offered or saved, so that corrupt multi-chunk output does not reach playback or Anki.
24. As a learner, I want Google requests to time out promptly, so that the play button does not remain indefinitely busy.
25. As a learner, I want oversized or suspicious endpoint responses rejected, so that pronunciation cannot consume unbounded memory.
26. As a learner, I want network, timeout, non-success status, invalid MIME type, invalid audio, assembly, and playback failures to enter the fallback chain, so that endpoint failures have consistent recovery.
27. As a learner, I want unsupported-language results to skip incompatible Kokoro providers, so that text is never spoken with a knowingly wrong Kokoro voice.
28. As a learner, I want a missing Kokoro speech model pack skipped during preview in favor of Web Speech, so that preview does not interrupt me with a download prompt.
29. As a learner adding a card, I want the existing speech-model consent flow offered when Kokoro becomes the required artifact fallback, so that large downloads remain explicit.
30. As a learner, I want declining a Kokoro download never to create a silent text-only post-feature Anki note, so that missing audio is not hidden.
31. As a learner, I want to add a card while Google pronunciation is still being prepared, so that I do not need to keep the translation result open.
32. As a learner, I want the queued card to retain enough provider-neutral information to retry Google and Kokoro later, so that closing the page does not lose the pronunciation requirement.
33. As a learner, I want a Google artifact used by a queued card protected from cache cleanup, so that Anki synchronization can complete later.
34. As a learner, I want an artifact released from queue protection after confirmed synchronization, so that abandoned media does not accumulate forever.
35. As a learner, I want a visible queue error when neither Google nor Kokoro can produce required audio, so that I can install the Kokoro pack or retry later.
36. As a learner, I want queued retries to preserve provider order and never substitute Web Speech, so that Anki always receives encoded audio from an artifact-capable provider.
37. As a Chrome user, I want Google TTS, fallback, stop, replay, and Anki audio to work in the production Chrome extension, so that the primary browser remains fully supported.
38. As a Firefox user, I want equivalent preview and Anki behavior in the released Firefox package, so that provider behavior is not browser-dependent.
39. As a keyboard or assistive-technology user, I want preparation, play, stop, fallback failure, and retry states exposed through accurate accessible names and status announcements, so that the feature is usable without relying on icons.
40. As a maintainer, I want Google TTS isolated behind the existing TTS provider concepts, so that an unofficial endpoint change does not spread into the translation result UI or Anki workflow.
41. As a maintainer, I want one high-level pronunciation orchestration seam to own provider ordering, so that the translation popover and browser popup cannot drift.
42. As a maintainer, I want provider selection keyed by exact text language and active translation provider, so that fallback policy is explicit and testable.
43. As a maintainer, I want Google requests to use one fixed complete origin with no configurable proxy or TLD, so that the network trust boundary remains narrow.
44. As a maintainer, I want endpoint traffic to omit cookies, credentials, referrers, raw-text logs, and audio logs, so that the experiment exposes no more data than required.
45. As a maintainer, I want cancellation and request identifiers to ignore stale chunk or provider completions, so that old audio cannot update a newer result.
46. As a maintainer, I want a feasibility probe before product integration, so that implementation stops cleanly if the unofficial endpoint is not viable in extension contexts.
47. As a maintainer, I want no CAPTCHA bypass, cookie harvesting, identity rotation, proxying, or similar circumvention, so that the product does not fight Google endpoint controls.
48. As a maintainer, I want automated tests to use fakes rather than the live unofficial endpoint, so that CI is deterministic and does not create endpoint traffic.
49. As a maintainer, I want the endpoint risk and fallback behavior documented, so that future releases do not mistake the unofficial service for a supported Google API.

## Implementation Decisions

- This feature uses the unofficial Google Translate TTS web endpoint, not Google Cloud Text-to-Speech. It introduces no Google Cloud project, API key, OAuth flow, billing account, or required LLT backend.
- Respect ADR 0002's provider boundary. Google TTS may be used only when Google Translate is the active translation provider. Selecting Bergamot must never silently send original text, translated text, or context sentences to Google TTS.
- Begin with a feasibility probe in production-shaped Chrome and Firefox extension contexts. Validate direct fixed-origin requests, response format, realistic short and multi-chunk text, cancellation, and playback. If the endpoint requires session cookies, CAPTCHA workarounds, rotating identities, a proxy, or other circumvention, stop the workstream and retain the current providers.
- Treat the endpoint as experimental infrastructure with no SLA. Do not describe it as an official Google API in code-facing domain language, settings, release notes, or user documentation.
- Add one high-level translated/original pronunciation orchestration seam. It receives exact text, language, the active translation provider, purpose (`preview` or `anki`), and a request identity; it owns provider ordering, cancellation, fallback, session state, and the final pronunciation artifact where applicable.
- Provider routing is fixed as follows:
  - Google translation + preview: Google TTS, then compatible already-ready Kokoro, then Web Speech.
  - Google translation + Anki: Google TTS, then compatible Kokoro; Web Speech is excluded.
  - Bergamot + preview: compatible already-ready Kokoro, then Web Speech; Google is excluded.
  - Bergamot + Anki: compatible Kokoro only; Google and Web Speech are excluded.
- Apply the routing policy independently to original and translated preview text. Original uses the exact `source_text` with `from_code`; translated uses the exact `translated_text` with `to_code`. Never substitute the context sentence.
- Preserve current Anki semantics. Only original text pronunciation is attached to the existing configured audio field. Translated pronunciation remains preview-only; no second field mapping or second sound marker is added.
- Preserve current eager original-audio preparation for Anki-eligible translation results. In Google translation mode the automatic artifact-capable chain begins with Google TTS. Translated-text Google TTS remains lazy and begins only when the learner activates Play.
- Introduce a Google Translate web TTS adapter behind the TTS provider boundary. Give it a stable internal provider identity and endpoint-contract revision so deterministic artifact identities change if the request or assembly contract changes.
- Use only the fixed complete HTTPS origin `https://translate.google.com` and the verified TTS path from the feasibility probe. Do not expose a custom URL, proxy, alternate TLD, or user-supplied endpoint.
- Requests omit credentials and cookies, use no referrer, accept only validated language codes, send only the requested text and speech language, enforce cancellation, and use a five-second timeout per endpoint request. Apply an overall bounded operation deadline for multi-chunk synthesis so a long result cannot remain preparing indefinitely.
- Validate non-error HTTP status, expected audio MIME types, declared and streamed response sizes, non-empty bytes, and decodability/playability before returning a pronunciation artifact. Endpoint HTML, JSON error pages, redirects, oversized bodies, and malformed audio are provider failures.
- Determine the safe per-request text limit during the feasibility probe and encode it as a reviewed constant. Do not assume the translation request's 2,000-character limit is accepted by the TTS endpoint.
- Split longer text deterministically at sentence boundaries, then whitespace/word boundaries, and only then at Unicode-safe code-point boundaries when necessary. Preserve all spoken text and original order; do not split surrogate pairs or normalize away meaningful punctuation.
- Fetch Google chunks in order or with tightly bounded concurrency that preserves output order and does not amplify endpoint load. Any failed, cancelled, invalid, or missing chunk invalidates the complete Google attempt.
- Assemble successful chunks into one valid pronunciation artifact. The assembly path must be verified for normal playback, stop/replay, seeking where available, Chrome, Firefox, and Anki media playback. Raw byte concatenation is acceptable only if the feasibility work proves the resulting audio valid; otherwise decode and re-encode through the existing audio capability.
- Never mix Google and Kokoro chunks within one artifact. Provider fallback restarts synthesis for the entire exact text with the next provider.
- Fallback-worthy failures include network errors, endpoint timeout, non-success status, throttling, redirect rejection, invalid content type, excessive response size, malformed or undecodable audio, incomplete chunk sets, assembly failure, artifact storage failure, missing playback data, and playback-start failure.
- User cancellation, Stop, dismissal, a superseding translation result, and an aborted request are terminal cancellation events, not fallback triggers.
- Kokoro is eligible only when its provider-language registry explicitly enables the requested language. Do not use a default English voice for unsupported text.
- For preview, a missing or non-ready Kokoro speech model pack immediately skips to Web Speech without prompting. A compatible installed pack may be used automatically.
- For Anki, retain the explicit Kokoro speech-model consent flow. If Google fails and the compatible Kokoro pack is known to be missing while the result is active, offer the existing download action. Declining consent cancels the immediate Add action or leaves an already queued item visibly waiting/failed; it never authorizes text-only synchronization.
- Extend durable queue metadata so an audio-required item can retain the ordered artifact-capable pronunciation requests needed for Google-to-Kokoro retry. Maintain backward compatibility with existing queue items that contain a single pronunciation request.
- Durable fallback candidates must retain exact text, normalized language, provider identity/revision, voice or endpoint voice identity, speed, encoding/assembly revision, and any policy context required to preserve the original remote/local choice. Do not re-resolve an old queued item into a newly remote provider it did not originally authorize.
- Keep Web Speech outside durable pronunciation requests and the Anki queue because it returns no encoded pronunciation artifact.
- Preview-only Google bytes are cached only for the active translation result and reused for replay. Dismissing or superseding the result revokes and discards the session artifact unless an Add action has promoted it to the durable artifact store.
- Adding to Anki persists and pins the chosen Google or Kokoro artifact before queue synchronization. If preparation is incomplete, persist the ordered artifact-capable requests so background fulfillment can finish later. Release the queue pin only after confirmed synchronization or explicit queue removal.
- Continue enforcing at most one active playback across original and translated controls and across artifact/Web Speech implementations. Starting another pronunciation stops the current audio before the next provider begins playback.
- Keep visible pronunciation state independent for original and translated controls. Required observable behavior remains preparing, ready, playing, stopped, failed, unsupported, and retry; internal provider transitions do not need separate buttons.
- Automatic fallback is normally silent. If every preview provider fails, show the existing failed/Retry state with concise user-facing copy. Low-level endpoint details remain in privacy-safe diagnostics without raw text, URLs containing text, or audio bytes.
- Update Options privacy copy to disclose that Google translation mode may send both original and translated visible text directly to Google's unofficial translation/TTS endpoints. State that Bergamot mode never invokes Google TTS.
- Update the domain glossary with a concise term for the ordered pronunciation provider policy if implementation needs to persist or expose it. Continue using pronunciation request, pronunciation artifact, and TTS provider rather than inventing endpoint-specific UI language.
- Support both Chrome and Firefox. Browser-specific hidden-document or playback plumbing may differ, but the high-level orchestration and provider contract must remain shared.

## Testing Decisions

- A good test asserts observable provider-chain behavior, returned pronunciation state/artifacts, durable queue outcomes, and UI actions. It does not assert private function calls, raw component state, exact internal message framing, or implementation-specific chunk classes.
- Use one high-level pronunciation orchestration seam as the primary automated seam. Inject fake Google, Kokoro, Web Speech, artifact-store, playback, clock, and cancellation capabilities.
- At the primary seam, verify Google success returns/plays its artifact and never invokes Kokoro or Web Speech.
- Verify each fallback-worthy Google failure invokes a compatible Kokoro provider exactly once for the complete text, not only the failed chunk.
- Verify Google failure plus unsupported or missing-pack Kokoro uses Web Speech for preview without showing a model-download prompt.
- Verify Google and Kokoro failure uses Web Speech once for preview and exposes stopped/complete state after playback.
- Verify failure of all preview providers exposes failed/Retry state and Retry restarts at the first provider allowed by policy.
- Verify Stop, dismissal, and superseding requests cancel active fetch/chunk assembly/playback, do not invoke fallback, and ignore stale completions.
- Verify provider routing for the complete matrix: Google versus Bergamot, preview versus Anki, original versus translated, Kokoro supported versus unsupported, and speech pack ready versus missing.
- Verify Bergamot paths never invoke the Google fake, even when Kokoro and Web Speech fail.
- Verify original requests contain only `source_text`/`from_code`, translated requests contain only `translated_text`/`to_code`, and neither contains the context sentence.
- Verify at most one playback capability is active and starting original playback stops translated playback and vice versa.
- Add narrow pure tests for deterministic Unicode-safe chunking: sentence boundaries, long single sentences, long individual tokens, punctuation, emoji/surrogate pairs, whitespace, exact reconstruction, stable order, and the endpoint limit.
- Add narrow hardened-client tests using fake fetch responses: timeout, abort, redirect, non-success status including throttling, invalid language code, wrong MIME type, declared oversize, streamed oversize, empty body, HTML error body, malformed audio, and valid audio.
- Add audio-assembly tests that prove multiple chunk responses become one decodable artifact in the original order. Assert the public artifact metadata and playable result rather than encoder internals.
- Add artifact-lifecycle tests: replay within one result does not refetch, dismissal discards preview-only bytes, Add promotes/pins the artifact, successful sync releases the queue pin, and queue removal cleans up unreferenced media.
- Extend queue-first prior art to verify Google artifact success, Google-to-Kokoro fallback, preparation still in progress, missing Kokoro pack, both artifact providers failed, retry after restart, and backward compatibility with legacy single-request queue entries.
- Verify Anki note creation is never invoked before a required artifact is ready and is never invoked with Web Speech or silently without audio.
- Extend translation result component tests for accurate original/translated accessible names and observable preparing, play, stop, failed, and retry controls. Do not snapshot provider-specific implementation details.
- Do not call the live unofficial endpoint in unit tests or normal CI. The feasibility probe and release smoke checks are explicit manual/opt-in integration activities.
- Feasibility acceptance requires manual Chrome and Firefox checks for short English and Spanish text, long multi-chunk text, replay without refetch, Stop, rapid result replacement, offline/network failure fallback, and an Anki note whose original Google artifact plays correctly.
- Existing browser-speech tests, pronunciation workflow tests, artifact-store tests, queue synchronization tests, translation popover tests, and browser popup tests are prior art and should be extended or consolidated around the high-level seam rather than duplicated.

## Out of Scope

- Google Cloud Text-to-Speech, Google Cloud credentials, API keys, OAuth, billing, quotas, or an LLT-operated TTS backend.
- Sending any TTS text to Google while Bergamot is the active translation provider.
- Attaching translated-text audio to Anki or adding a second Anki audio-field mapping.
- Replacing the existing original-text pronunciation meaning in Anki.
- Enabling new Kokoro languages, validating Spanish Kokoro phonemization, downloading new speech model packs, or adding voice-selection UI.
- Guaranteeing that Web Speech is local, offline, consistent across operating systems, or capable of returning reusable bytes.
- Prompting for a Kokoro speech-model download solely for preview playback.
- Mixing chunks from different TTS providers into one pronunciation artifact.
- CAPTCHA solving, cookie harvesting, account/session automation, proxy rotation, alternate Google domains, identity rotation, request obfuscation, or any other endpoint-control circumvention.
- Changing the Google Translate translation endpoint or the translation provider selector beyond privacy copy needed for this feature.
- Uploading text, endpoint URLs containing text, audio, or pronunciation metadata to analytics.
- A full pronunciation settings redesign, voice marketplace, speed controls, pronunciation scoring, speech recognition, or microphone input.

## Further Notes

- The unofficial endpoint can change or disappear without warning. Google, Kokoro, and Web Speech are ordered capabilities, not equivalent reliability promises.
- This feature extends ADR 0002's accepted Google quality mode but must preserve its rule that Bergamot never silently falls back to a remote Google service.
- Google Translate already receives the selected translation request in Google mode. TTS additionally sends the visible original or translated text when that pronunciation is prepared; Options must disclose both purposes separately enough to be understandable.
- The target Spanish use case will normally route Google TTS to Web Speech on failure because the current Kokoro registry does not enable Spanish. The architecture still includes Kokoro in the chain for languages it explicitly supports.
- A Google pronunciation artifact may be reused by Anki under the same provider-neutral contract as Kokoro, but it is remote-generated and not offline. Artifact identity must include its provider and assembly revision so caches never confuse it with local Kokoro output.
- The 200-character figure discussed during planning is an initial probe value, not a trusted endpoint contract. The implementation constant should come from the feasibility probe and remain conservative.
- If the feasibility gate fails, close this spec as blocked or revise it to retain Web Speech/Kokoro only; do not quietly broaden network permissions or introduce a proxy.
