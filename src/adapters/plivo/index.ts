import type { OutboundSMSMessage, SMSAdapter, SMSResult, SMSWebhookHandler } from '../../types.js'

import { SMSProviderError } from '../../errors.js'
import { makePlivoWebhook } from './webhook.js'

export interface PlivoAdapterOptions {
  authId: string
  authToken: string
  defaultFrom?: string
  webhook?: {
    path?: string
    trustProxy?: boolean
  } | false
}

const loadPlivo = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Client: new (id: string, token: string) => any
}> => {
  try {
    const mod = await import('plivo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ns: any = (mod as any).default ?? mod
    return ns
  } catch (err) {
    throw new SMSProviderError(
      "Install 'plivo' to use the Plivo adapter (pnpm add plivo)",
      { cause: err },
    )
  }
}

const buildWebhook = (opts: PlivoAdapterOptions): SMSWebhookHandler | undefined => {
  if (opts.webhook === false) return undefined
  const baseHandler = makePlivoWebhook({
    authToken: opts.authToken,
    trustProxy: opts.webhook?.trustProxy,
  })
  return opts.webhook?.path
    ? { ...baseHandler, path: opts.webhook.path }
    : baseHandler
}

export const plivoAdapter = (opts: PlivoAdapterOptions): SMSAdapter => ({
  name: 'plivo',
  defaultFrom: opts.defaultFrom,
  webhook: buildWebhook(opts),
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const plivo = await loadPlivo()
    const client = new plivo.Client(opts.authId, opts.authToken)

    const payload: Record<string, unknown> = {
      src: message.from,
      dst: message.to,
      text: message.body,
    }
    if (message.mediaUrls?.length) {
      payload.type = 'mms'
      payload.media_urls = message.mediaUrls
    }

    try {
      const response = await client.messages.create(payload)
      const rawId = response?.messageUuid
      const id = Array.isArray(rawId) ? String(rawId[0]) : String(rawId ?? '')
      return {
        id,
        provider: 'plivo',
        status: 'queued',
        to: message.to,
        from: message.from,
        body: message.body,
        raw: response,
        sentAt: new Date(),
      }
    } catch (err) {
      throw new SMSProviderError(`Plivo send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }
  },
})
