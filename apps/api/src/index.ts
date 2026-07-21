import type { TranslateRequest } from '@package/shared'
import Fastify from 'fastify'

import {
  checkTranslatorHealth,
  translateViaTranslator,
  TranslatorClientError,
} from './translator-client.js'

const translateBodySchema = {
  type: 'object',
  required: ['text', 'from_code', 'to_code'],
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 10_000 },
    from_code: { type: 'string', minLength: 2, maxLength: 10 },
    to_code: { type: 'string', minLength: 2, maxLength: 10 },
  },
} as const

const app = Fastify({
  logger: true,
})

app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    return reply.status(204).send()
  }
})

app.get('/health', async () => {
  const translatorHealthy = await checkTranslatorHealth()

  return {
    status: translatorHealthy ? 'ok' : 'degraded',
    translator: translatorHealthy ? 'ok' : 'unavailable',
  }
})

app.post<{ Body: TranslateRequest }>(
  '/translate',
  {
    schema: {
      body: translateBodySchema,
    },
  },
  async (request, reply) => {
    const { text, from_code, to_code } = request.body

    request.log.info(
      {
        from_code,
        to_code,
        textLength: text.length,
      },
      'translation request',
    )

    try {
      const result = await translateViaTranslator(request.body)

      return {
        ...result,
        can_add_to_anki: false,
      }
    } catch (error) {
      if (error instanceof TranslatorClientError) {
        return reply.status(error.statusCode).send({
          error: error.message,
        })
      }

      request.log.error(error, 'unexpected translation error')

      return reply.status(500).send({
        error: 'Translation failed',
      })
    }
  },
)

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.PORT) || 3000

    await app.listen({
      port,
      host: '0.0.0.0',
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()
