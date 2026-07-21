import { MAX_TRANSLATION_TEXT_LENGTH } from '@package/shared';
import { getGoogleTranslateToken } from '../vendor/googletrans/google-token';

const GOOGLE_TRANSLATE_URL = 'https://translate.google.com/translate_a/single';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const LANGUAGE_CODE_PATTERN = /^(?:auto|[a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i;

export class GoogleTranslationError extends Error {
  constructor(
    public readonly kind: 'invalid_request' | 'network' | 'response' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleTranslationError';
  }
}

export interface GoogleTranslationClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

function assertLanguageCode(value: string, field: 'from_code' | 'to_code'): string {
  const normalized = value.trim().toLowerCase();
  if (!LANGUAGE_CODE_PATTERN.test(normalized)) {
    throw new GoogleTranslationError('invalid_request', `Invalid ${field}`);
  }
  return normalized;
}

function buildRequestUrl(text: string, fromCode: string, toCode: string): string {
  const url = new URL(GOOGLE_TRANSLATE_URL);
  const params = url.searchParams;
  params.set('client', 't');
  params.set('sl', fromCode);
  params.set('tl', toCode);
  params.set('hl', 'en');
  for (const value of ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't']) {
    params.append('dt', value);
  }
  params.set('ie', 'UTF-8');
  params.set('oe', 'UTF-8');
  params.set('otf', '1');
  params.set('ssel', '0');
  params.set('tsel', '0');
  params.set('kc', '7');
  params.set('q', text);
  params.set('tk', getGoogleTranslateToken(text));
  return url.toString();
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new GoogleTranslationError('response', 'Google Translate response is too large');
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new GoogleTranslationError('response', 'Google Translate response is too large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new GoogleTranslationError('response', 'Google Translate response is too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function parseTranslatedText(payload: unknown): string {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new GoogleTranslationError('response', 'Unexpected response from Google Translate');
  }

  const translated = payload[0]
    .filter(Array.isArray)
    .map(segment => segment[0])
    .filter((value): value is string => typeof value === 'string')
    .join('');

  if (!translated) {
    throw new GoogleTranslationError('response', 'Google Translate returned no translation');
  }
  return translated;
}

export async function translateWithGoogle(
  text: string,
  fromCode: string,
  toCode: string,
  signal?: AbortSignal,
  options: GoogleTranslationClientOptions = {},
): Promise<string> {
  if (!text || text.length > MAX_TRANSLATION_TEXT_LENGTH) {
    throw new GoogleTranslationError(
      'invalid_request',
      `Text must contain 1–${MAX_TRANSLATION_TEXT_LENGTH} characters`,
    );
  }

  const from = assertLanguageCode(fromCode, 'from_code');
  const to = assertLanguageCode(toCode, 'to_code');
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  let timedOut = false;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const forwardAbort = () => controller.abort(new DOMException('Aborted', 'AbortError'));
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Timed out', 'AbortError'));
  }, timeoutMs);

  try {
    const response = await fetchImpl(buildRequestUrl(text, from, to), {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    if (!response.ok) {
      throw new GoogleTranslationError(
        'response',
        `Google Translate request failed (${response.status})`,
      );
    }

    const rawText = await readBoundedText(response, maxResponseBytes);
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new GoogleTranslationError('response', 'Invalid JSON from Google Translate');
    }
    return parseTranslatedText(payload);
  } catch (error) {
    if (timedOut) {
      throw new GoogleTranslationError('timeout', 'Google Translate request timed out');
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof GoogleTranslationError) throw error;
    throw new GoogleTranslationError('network', 'Could not reach Google Translate');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
