export const TRANSLATOR_BASE_URL =
  process.env.TRANSLATOR_BASE_URL ?? 'http://127.0.0.1:8000'

export const TRANSLATOR_TIMEOUT_MS = Number(process.env.TRANSLATOR_TIMEOUT_MS) || 10_000

export const TRANSLATOR_HEALTH_TIMEOUT_MS = 3_000
