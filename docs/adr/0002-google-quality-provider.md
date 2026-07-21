# Google quality provider with Bergamot offline mode

**Status:** accepted

Translation quality is more important for the default product path than keeping every request local. The extension therefore sends translation requests directly from its background context to the unofficial Google Translate web endpoint. Users can explicitly select Bergamot when offline operation and local text processing matter more than translation quality.

The shared `TranslationEngine` interface remains the boundary. The content script always sends the same `TranslateRequest` to the background; the background selects the stored provider. The existing Fastify/Argos adapter remains optional and is not part of the current provider selector.

## Security and privacy constraints

- Use the fixed complete origin `https://translate.google.com`; do not expose a configurable TLD or URL.
- Send only the selected translation text and language pair. Context sentences remain local.
- Limit input to 2,000 characters, apply an 8-second timeout, cap response bytes, validate the response shape, and support cancellation.
- Do not install the `googletrans` npm package or its dependency graph. Vendor only the MIT-licensed token calculation with attribution and use browser-native `fetch`.
- Disclose remote text transmission in Options. Do not silently fall back from Bergamot to Google.

## Trade-offs

The endpoint is undocumented and may change, throttle requests, block extension traffic, or apply unknown quotas. There is no API key, contractual SLA, or stable rate-limit contract. If it stops working, the extension returns an error and the user can choose Bergamot; it does not redirect text to another remote service.
