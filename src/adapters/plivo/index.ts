import type { OutboundSMSMessage, SMSAdapter, SMSResult } from '../../types.js'

import { SMSProviderError } from '../../errors.js'

export interface PlivoAdapterOptions {
  authId: string
  authToken: string
  defaultFrom?: string
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

export const plivoAdapter = (opts: PlivoAdapterOptions): SMSAdapter => ({
  name: 'plivo',
  defaultFrom: opts.defaultFrom,
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
