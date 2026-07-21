import type { TranslateRequest, TranslateResponse } from '@package/shared'

import {
  TRANSLATOR_BASE_URL,
  TRANSLATOR_HEALTH_TIMEOUT_MS,
  TRANSLATOR_TIMEOUT_MS,
} from './config.js'

export class TranslatorClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'TranslatorClientError'
  }
}

type TranslatorTranslateResponse = Omit<TranslateResponse, 'can_add_to_anki'>

export async function translateViaTranslator(
  request: TranslateRequest,
  baseUrl: string = TRANSLATOR_BASE_URL,
  timeoutMs: number = TRANSLATOR_TIMEOUT_MS,
): Promise<TranslatorTranslateResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response

    try {
      response = await fetch(`${baseUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TranslatorClientError(502, 'Translator request timed out')
      }

      throw new TranslatorClientError(502, 'Translator unavailable')
    }

    if (response.status === 422) {
      throw new TranslatorClientError(422, 'Unsupported language pair or invalid request')
    }

    if (!response.ok) {
      throw new TranslatorClientError(500, 'Translation failed')
    }

    return (await response.json()) as TranslatorTranslateResponse
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkTranslatorHealth(
  baseUrl: string = TRANSLATOR_BASE_URL,
  timeoutMs: number = TRANSLATOR_HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    })

    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
