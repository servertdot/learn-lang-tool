import type { TranslateRequest, TranslateResponse } from '@package/shared';
import { API_BASE_URL } from '@package/shared';

export class TranslationApiError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'TranslationApiError';
  }
}

export async function translate(
  request: TranslateRequest,
  signal?: AbortSignal,
  baseUrl: string = API_BASE_URL,
): Promise<TranslateResponse> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new TranslationApiError(null, 'Network error');
  }

  if (!response.ok) {
    throw new TranslationApiError(response.status, `API error: ${response.status}`);
  }

  return response.json() as Promise<TranslateResponse>;
}
