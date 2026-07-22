# Kokoro TTS Preview and Anki Audio

## Problem Statement

Learn Lang Tool currently gives the learner a translation result containing the original selection, its translation, and, when available, a context sentence. The learner can read that information and save it to Anki, but cannot hear how the original text is pronounced. This makes the translation result incomplete for language learning: recognizing meaning without hearing pronunciation does not prepare the learner to understand or produce the phrase in speech.

Audio must also survive beyond the translation popover. The learner needs the generated pronunciation to be stored as Anki media and referenced by the created note so that the same pronunciation is available during review. Browser speech synthesis is therefore insufficient because it can play speech but does not return reusable audio bytes.

Speech generation may take noticeably longer than translation. The interface must remain responsive and must make background generation visible without blocking the learner from reading the translation result or saving the card. The implementation must also preserve the existing offline queue behavior when Anki is closed.

The first implementation will use Kokoro for English pronunciation, but speech synthesis must not become coupled to one model, one language pair, or one runtime. The product must be able to add languages such as Spanish and to replace or supplement Kokoro with another local or hosted provider later.

## Solution

Add a local speech synthesis capability backed by a deliberately installed Kokoro model pack. Once a translation result is available and the relevant speech model pack is ready, the extension starts preparing pronunciation for the exact original text shown in the result. Speech preparation runs outside the visible page UI so translation remains interactive.

The translation popover and the extension popup gain a compact pronunciation control associated with the **Original** section. While speech is being generated, the control displays a clear, accessible processing state. When generation succeeds, the learner can play, stop, and replay the generated audio. The preview must use the same encoded audio artifact that is attached to the Anki note.

Adding a card remains queue-first. The learner may add the card while pronunciation is still being generated. The queued item records a provider-neutral synthesis request rather than embedding large base64 audio in extension storage. Anki synchronization waits until the pronunciation artifact is ready, then sends the note and audio together through AnkiConnect. A newly queued card must never be silently synchronized without its required audio.

The initial synthesis target is the exact `source_text` from the translation result. It may be a word, phrase, or selected sentence. The extension must not silently replace it with the translation or with a larger context sentence, because the visible preview and the Anki audio must describe the same text. Choosing context-sentence audio, translated-text audio, or multiple audio clips can be added as a separate product decision later.

Kokoro is hidden behind an `AudioTtsProvider` capability. Language support, model revisions, voice defaults, model-pack requirements, and artifact metadata are declared by provider and language registries. The initial release enables English. A language such as Spanish can later be enabled by adding a registry entry and validating the appropriate Kokoro phonemizer and voice assets, without changing the translation popover, Anki queue, or AnkiConnect workflow.

## User Stories

1. As a language learner, I want pronunciation preparation to start after a translation result appears, so that the audio is often ready before I ask to hear it.
2. As a language learner, I want the translation result to remain readable while audio is being prepared, so that slower speech generation does not block comprehension.
3. As a language learner, I want to see that pronunciation is being prepared in the background, so that I do not mistake latency for a broken control.
4. As a language learner, I want the pronunciation control to appear beside the original text, so that it is clear which text will be spoken.
5. As a language learner, I want to play the generated pronunciation from the translation popover, so that I can hear the original selection without leaving the page.
6. As a language learner, I want the same pronunciation control in the extension popup used for browser PDF selections, so that pronunciation behavior is consistent across supported sources.
7. As a language learner, I want to stop currently playing pronunciation, so that I remain in control of audio output.
8. As a language learner, I want to replay pronunciation, so that I can listen as many times as necessary.
9. As a language learner, I want repeated play requests to reuse prepared audio, so that the model does not regenerate the same pronunciation unnecessarily.
10. As a language learner, I want a clear retry action after speech generation fails, so that a transient failure does not force me to repeat the translation.
11. As a language learner, I want a clear explanation when the configured provider does not support the source language, so that the extension never speaks text with the wrong language or voice.
12. As a language learner, I want the extension to ask before downloading a large speech model pack, so that storage and bandwidth usage are explicit.
13. As a language learner, I want to see the approximate model-pack size before consenting, so that I can make an informed download decision.
14. As a language learner, I want model-pack download, cancellation, failure, and retry states, so that installation is recoverable.
15. As a privacy-conscious learner, I want Kokoro synthesis to remain on my device after model installation, so that selected text is not sent to a speech API.
16. As an offline learner, I want speech generation and Anki queueing to work without internet after the model pack is installed, so that the learning flow remains local-first.
17. As a language learner, I want to add a card while audio is still being prepared, so that I do not have to wait with the translation popover open.
18. As a language learner, I want my add action to be preserved when Anki is closed, so that the note and its required audio can synchronize later.
19. As a language learner, I want a queued card to wait for successful audio generation, so that it is never silently added to Anki without pronunciation.
20. As a language learner, I want audio-generation errors on queued cards to remain visible and retryable, so that failed media does not disappear unnoticed.
21. As a language learner, I want the audio heard in the translation popover to be the audio stored in Anki, so that review does not unexpectedly use a different voice or pronunciation.
22. As a language learner, I want the Anki note to contain a normal `[sound:...]` media reference, so that pronunciation plays through Anki and synchronizes through AnkiWeb like other media.
23. As a language learner, I want to map generated audio to a field in my selected Anki model, so that the feature works with my existing note type.
24. As a user of the default Anki settings, I want a sensible default audio-field mapping, so that audio works without additional configuration when the expected fields exist.
25. As a language learner, I want retries after an ambiguous AnkiConnect timeout to avoid duplicate notes and duplicate media, so that temporary connection failures do not corrupt my collection.
26. As a language learner, I want quickly replacing one selection with another to cancel or ignore stale speech results, so that audio from an earlier selection never appears under a newer translation.
27. As a keyboard or assistive-technology user, I want pronunciation states and actions to have accurate labels and status announcements, so that the feature is usable without relying on the icon or animation alone.
28. As a user sensitive to motion, I want the processing state to remain understandable when animation is reduced, so that status does not depend only on motion.
29. As a learner with many queued cards, I want audio bytes stored outside the lightweight queue metadata, so that extension storage does not fill with base64 data.
30. As a learner who clears the Anki queue, I want unreferenced local pronunciation artifacts to be cleaned up, so that abandoned cards do not permanently consume storage.
31. As a learner who encounters the same source text again, I want deterministic artifact reuse, so that identical synthesis requests do not create redundant work or Anki media.
32. As a future Spanish learner, I want language selection to choose a compatible Kokoro voice and text-processing path, so that Spanish can be added without redesigning the feature.
33. As a future learner of a language unsupported by Kokoro, I want the application to select another compatible provider when one is configured, so that Kokoro does not limit the product architecture.
34. As a maintainer, I want speech synthesis isolated behind a stable provider contract, so that Kokoro can be upgraded or replaced without changing Anki or presentation logic.
35. As a maintainer, I want executable runtime assets bundled with the extension and model weights treated as explicit data downloads, so that the implementation complies with Manifest V3 remote-code constraints.
36. As a maintainer, I want model revisions and voice assets pinned and integrity-checked, so that pronunciation behavior is reproducible and supply-chain changes are controlled.
37. As a maintainer, I want provider and language failures represented by stable error categories, so that all UI surfaces show consistent recovery actions.
38. As a maintainer, I want existing text-only queued notes created before this feature to remain syncable, so that an extension upgrade does not strand user data.
39. As a user of manual TSV or CSV export, I want an explicit warning that the text export does not bundle media, so that I do not assume pronunciation will be imported with the text.

## Implementation Decisions

- Introduce the domain terms **speech model pack**, **pronunciation request**, **pronunciation artifact**, and **TTS provider**. Add them to the project glossary during implementation. A pronunciation request describes what should be synthesized; a pronunciation artifact is encoded audio plus metadata; a TTS provider converts one into the other.

- Use Kokoro 82M v1.0 as the initial provider and pin an approved ONNX revision. Use a broadly compatible quantized model for the first implementation rather than requiring WebGPU. The expected core-model download is approximately 90 MB, plus tokenizer, runtime data, phonemizer data, and selected voice assets. The exact displayed size must come from the pinned pack manifest rather than a hard-coded marketing estimate.

- Ship English as the initial supported speech language. Select one reviewed English voice as the default and keep the choice in the provider-language registry. Voice selection UI and voice blending are not required initially.

- Treat Spanish as the first planned extension, not part of initial acceptance. Kokoro v1.0 publishes Spanish voices, but browser integration must validate raw Spanish text normalization and grapheme-to-phoneme behavior before the registry advertises support. Adding Spanish must not require a second copy of the shared Kokoro core model when the same weights are compatible; only language-specific processing and voice assets should be added.

- Key provider selection by source language, not by translation language pair. Translation model packs remain pair-specific; speech model packs declare a set of synthesis languages. This prevents `en → ru`, `en → es`, and other translation directions from duplicating the same English speech assets.

- Define a provider-neutral `AudioTtsProvider` boundary. It must expose provider identity and revision, report language capability and required model packs, synthesize with cancellation, and return an encoded pronunciation artifact with bytes, MIME type, file extension, sample rate, and the effective language/voice/speed metadata. Kokoro- or Transformers.js-specific types must not cross this boundary.

- Define stable failure categories at the provider boundary: model pack missing, model pack invalid, language unsupported, request cancelled, generation timed out, generation failed, artifact encoding failed, and artifact storage failed. UI copy may be friendlier, but branching must not depend on parsing arbitrary exception text.

- Keep the Transformers.js library, ONNX runtime/WASM, phonemizer implementation, and all executable code inside the extension package. Download only model/configuration/voice data after explicit consent. Use the existing local model-pack pattern: a pinned manifest, approximate size, progress state, cancellation, integrity metadata, Cache API storage, and a separate readiness record.

- Keep speech model-pack state separate from Bergamot translation model-pack state. Installing, updating, or removing one must not alter the other. Speech pack identifiers include provider and model revision so an upgrade can coexist with pronunciation requests created under an earlier pinned revision until those requests finish or are migrated.

- Run Kokoro loading, inference, waveform encoding, and audio playback in a long-lived extension document or equivalent runtime host, not in the content-script rendering path or the MV3 service worker. Reuse the existing offscreen inference architecture where supported, while keeping messaging contracts browser-neutral so the Firefox build can use its supported extension-document/background equivalent.

- Start pronunciation preparation automatically after a successful, Anki-eligible translation result when the required speech pack is ready. Do not silently download the model. When the pack is missing, expose an install action from the pronunciation control; an Add to Anki action may continue only after the user accepts the required pack download.

- Synthesize the exact `source_text` shown under **Original** and use the translation result's `from_code` as the speech language. Normalize language tags through the provider-language registry. Do not use browser locale inference, the target language, or context-sentence substitution.

- Represent visible pronunciation state independently from translation and Anki-add state. Required observable states are: pack missing, preparing, ready, playing, stopped, failed, and unsupported. A request ID ties state to one translation result so stale completion events are ignored.

- Place a compact pronunciation action in the **Original** header area of both the translation popover and popup result. During preparation, show a spinner or equivalent progress treatment and a concise `Preparing audio…` status. The control is not playable until an artifact is ready. Failure changes the control to a retry action and does not hide the translation.

- Use accessible names that reflect state: `Preparing pronunciation`, `Play pronunciation`, `Stop pronunciation`, `Retry pronunciation`, and `Download speech model`. Announce preparation completion and failure politely; do not repeatedly announce animation frames or low-level progress updates.

- Enforce at most one active playback. Playing another artifact stops the current one. Replaying uses cached encoded bytes. Dismissing a result stops playback. Unqueued preview generation may be cancelled when its result is dismissed; a pronunciation job referenced by a queued card continues independently.

- Encode artifacts as mono MP3 at 24 kHz and 64 kbps. MP3 is the most portable audio format across Anki desktop, AnkiWeb, and mobile clients, while keeping synced media substantially smaller than PCM16 WAV. Keep MIME type and extension provider-neutral so a future provider may return another supported format.

- Compute a deterministic artifact key and filename from normalized source text, normalized language, provider ID, provider/model revision, voice ID, speed, and encoding version. Do not include the raw source text in the filename. Retries for the same request must resolve to the same media filename.

- Store reusable pronunciation bytes in a dedicated artifact cache, not inside the existing serialized Anki queue. Queue entries reference an artifact key and retain the complete provider-neutral pronunciation request needed to recreate it. Artifacts required by queued cards are protected from eviction; preview-only artifacts follow a bounded least-recently-used policy.

- Extend queued card data with an audio requirement and a status that distinguishes waiting for generation, ready to synchronize, synchronization failure, and a non-retryable provider/configuration failure. The queue remains durable if the translation popover closes, the service worker suspends, the browser restarts, or Anki is unavailable.

- Preserve existing queue-first behavior. Adding a card first persists the note content and pronunciation request, then attempts preparation and Anki synchronization. If audio is still preparing, Anki is closed, or another retryable condition exists, return a queued result immediately with a reason suitable for user-facing copy.

- Never create a new post-feature Anki note without its required audio. If generation or encoding fails, retain the item in the queue and expose the error. Manual retry and scheduled retry both resume from the last durable stage. There is no silent text-only fallback.

- Extend the semantic Anki field mapping with `audio`. The default mapping uses the existing `Reading` field for audio when that field is present; users may map another model field. Note construction includes the selected destination field, and the AnkiConnect request supplies pronunciation media with base64 `data`, deterministic `filename`, and the destination `fields` list.

- Attach audio as part of the AnkiConnect note-add operation rather than as an independent preflight media upload. This keeps the sound marker and note creation in the same idempotent queue attempt. Continue using the private queue tag to detect a note created before a response was lost. Deterministic filenames make media retries safe.

- After confirmed Anki synchronization, release the queue's protection on the local artifact. The bounded cache may retain it for reuse, but clearing the queue must remove artifacts that have no remaining queued or preview references.

- Migrate queue parsing without discarding old entries. Queue items created before audio support remain legacy text-only items and may synchronize under their original contract. Every newly created item uses the new audio-required schema.

- Keep manual TSV/CSV export text-only for this feature. The Options UI must say that manual text export does not include generated media. Packaging text plus media for manual import requires a separate archive/export design.

- Do not send source text, generated audio, or pronunciation metadata to analytics. Diagnostic logging may record provider ID, language, state transition, duration, and stable error category, but must not record the utterance or audio bytes.

## Testing Decisions

- Prefer one high-level orchestration seam for most automated behavior: the pronunciation-and-Anki workflow receives a translation result and durable queue, while fake TTS provider, artifact store, clock, and Anki gateway dependencies expose externally observable outcomes. Tests should assert states, queue durability, audio attachment, and retry behavior rather than Transformers.js calls or private class structure.

- Add focused presentation tests only for behavior that cannot be proven through the orchestration seam. Render the translation popover and popup result in pack-missing, preparing, ready, playing, failed, and unsupported states; assert visible copy, enabled/disabled actions, accessible names, and Anki status interaction. Follow the existing static-render component tests for translation and Anki actions.

- Extend Anki note-mapping tests to prove that the `audio` semantic mapping selects the intended destination field and that the default `Reading` mapping remains configurable.

- Extend AnkiConnect client tests at the existing injected-fetch seam. Assert that an audio-enabled note contains base64 data, a deterministic safe filename, and the mapped field list; also assert API errors remain typed and surfaced.

- Extend queue and synchronization tests at the existing in-memory storage and dependency-injection seam. Cover adding while generation is pending, Anki closed, generation failure, retry success, lost Anki response, deterministic media reuse, queue clearing, artifact retention/cleanup, and browser-restart restoration.

- Test that a newly created audio-required queue item never invokes note creation before the pronunciation artifact is ready and never falls back to a text-only note after failure.

- Test cancellation and stale-result protection by completing an older pronunciation request after a newer translation result has become active; the older result must not update or play in the newer UI.

- Test provider capability routing with English supported, Spanish configured but initially disabled, and an unsupported language. The unsupported case must produce a stable capability error and must not invoke Kokoro with a fallback voice.

- Test model-pack behavior through its existing high-level installer/store seam: explicit consent is presentation behavior, while installer tests cover cached assets, pinned manifest interpretation, cancellation, partial failure, readiness, and retry. Do not assert individual internal fetch order unless ordering is externally required.

- Do not download the roughly 90 MB Kokoro model in the normal unit-test suite. Add a separately invoked local smoke test or fixture-driven integration test that loads the pinned real pack, generates a short English sample, validates a non-empty decodable MP3, and records generation time for developer inspection. It must not make CI correctness depend on subjective voice quality.

- Perform manual acceptance checks on supported Chrome and Firefox desktop builds. Verify first pack installation, cold and warm generation, a single word, a short phrase, a sentence, punctuation, numbers, rapid selection replacement, popover dismissal, playback interruption, Anki open, Anki closed, restart with queued audio, and AnkiWeb-compatible media playback.

- Evaluate pronunciation quality with a fixed English corpus before release. Include names, contractions, abbreviations, numbers, punctuation, short selections, and sentences. Quality review is an acceptance activity, not a snapshot/unit assertion.

- Preserve prior-art behaviors already covered by tests: translation result rendering, queued-card messaging, idempotent private tags, permission negotiation, model field discovery, and configurable field mappings.

## Out of Scope

- Shipping Spanish, Russian, or any speech language other than English in the initial release.
- Synthesizing the translated text or automatically generating both source and target audio.
- Automatically replacing the original selection with its context sentence for synthesis.
- Multiple audio clips per note, such as separate word and context-sentence recordings.
- User-facing voice selection, voice blending, voice cloning, custom speaker samples, pitch controls, or per-card speed controls.
- Hosted TTS providers, API keys, a required backend, or silent cloud fallback when Kokoro fails.
- Speech recognition, pronunciation scoring, microphone recording, or comparison of learner speech with generated speech.
- Streaming partial Kokoro audio before the complete artifact is encoded.
- MP3/Opus encoding optimization in the initial implementation.
- Bundling media with TSV/CSV exports or producing an Anki package/archive.
- Retroactively generating audio for legacy queue items or notes already present in Anki.
- Automatically deleting media already copied into Anki.
- Treating subjective model quality as an automated test result.

## Further Notes

- The supporting investigation is recorded in [`docs/research/tts-options.md`](../research/tts-options.md).
- Kokoro v1.0 is an Apache-2.0 82M-parameter speech model. Its published voice inventory includes English and Spanish, but the initial browser release deliberately validates and enables English first: [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M), [voice inventory](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md), and [Transformers.js-compatible ONNX conversion](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
- AnkiConnect accepts base64 media data while adding a note and appends a `[sound:filename]` marker to the configured fields. This is the selected integration path: [AnkiConnect implementation](https://github.com/FooSoft/anki-connect/blob/master/plugin/__init__.py).
- Kokoro documentation warns that very short utterances can be weaker than medium-length input. The quality corpus must therefore include single words and short phrases even though the product's strongest use case is sentence and phrase learning.
- The specification intentionally keeps the TTS provider boundary deeper than the Kokoro adapter. Future providers should compete on the same pronunciation-request/artifact contract rather than adding provider-specific branches to the translation popover or Anki queue.
