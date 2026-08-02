# Google Translate web TTS feasibility

Date: 2026-08-02

## Endpoint contract

The experimental provider uses only `https://translate.google.com/translate_tts` with `client=tw-ob`, UTF-8 text, an explicit speech language, and deterministic chunk position metadata. Requests omit credentials, disable referrers and caching, reject redirects, and apply a five-second deadline per chunk. The implementation accepts bounded `audio/mpeg` or `audio/mp3` responses only, decodes every chunk, and re-encodes the complete text as one validated MP3 artifact.

The reviewed per-request limit is 200 Unicode code points. Text over that limit is split at sentence boundaries, then whitespace boundaries, then code-point boundaries. This limit is intentionally conservative because the endpoint is undocumented and can change without notice.

## Probe result

An anonymous direct request with the non-sensitive fixture text `hello` returned HTTP 200 and `audio/mpeg`. The 7,104-byte response was recognized as mono MPEG Layer III audio at 24 kHz and 64 kbps. No account, API key, CAPTCHA workaround, proxy, alternate origin, or session input was used.

Both production targets build with the shared runtime document included. Chrome uses an MV3 offscreen document; Firefox uses the same runtime in a hidden extension frame when the offscreen API is unavailable.

## Release gate

The direct probe establishes the basic endpoint response contract, not release acceptance. Before publishing a browser package, load the production Chrome and Firefox builds and verify:

1. Short English and Spanish original/translated playback.
2. Text over 200 code points, including ordered multi-chunk playback.
3. Replay without a second endpoint request while the result remains open.
4. Stop and rapid replacement without stale playback or fallback.
5. Network failure routing to ready compatible Kokoro, then Web Speech for preview.
6. Bergamot mode producing no Google TTS request.
7. Anki receiving playable original-text Google audio, with Google-to-Kokoro retry and no Web Speech or silent text-only substitute.

If direct extension traffic starts requiring cookies, CAPTCHA handling, identity rotation, a proxy, or any other endpoint-control circumvention, disable the provider and retain the Kokoro/Web Speech paths.
