import { MAX_TRANSLATION_TEXT_LENGTH, type TranslateRequest } from '@package/shared';
import { readBoundedText } from './read-bounded-text';
import { TranslationFacadeError } from './translation-facade';

export function validatedLanguageCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || code === 'und') {
    throw new Error('Invalid language code. Choose a language in settings.');
  }
  return code;
}

export function remoteLanguagePair(request: TranslateRequest) {
  if (!request.text) throw new Error('Select text to translate.');
  if (request.text.length > MAX_TRANSLATION_TEXT_LENGTH) {
    throw new TranslationFacadeError('text_too_long', `Text is too long (max ${MAX_TRANSLATION_TEXT_LENGTH} characters).`);
  }
  return {
    from: request.from_code === 'auto' ? 'auto' : validatedLanguageCode(request.from_code),
    to: validatedLanguageCode(request.to_code),
  };
}

export async function fetchTranslationJson(
  provider: string,
  url: URL,
  init: RequestInit,
  options: { fetch?: typeof fetch },
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const deadline = AbortSignal.timeout(8_000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await (options.fetch ?? fetch)(url, {
      ...init,
      signal: requestSignal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      throw new TranslationFacadeError('engine_failure', `${provider} request failed (HTTP ${response.status}).`);
    }
    const raw = await readBoundedText(
      response,
      256 * 1024,
      new TranslationFacadeError('engine_failure', `${provider} response is too large.`),
    );
    try {
      return JSON.parse(raw);
    } catch {
      throw new TranslationFacadeError('engine_failure', `Invalid response from ${provider}.`);
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (deadline.aborted) throw new Error(`${provider} request timed out.`);
    if (error instanceof TranslationFacadeError) throw error;
    // Raw fetch errors may include the full URL, including selected text or a contact address.
    throw new Error(`Could not reach ${provider}.`);
  }
}
