import type { OutboundSMSMessage, SMSAdapter, SMSResult } from '../../types.js'

import { SMSProviderError } from '../../errors.js'

export interface VonageAdapterOptions {
  apiKey: string
  apiSecret: string
  defaultFrom?: string
}

const loadVonage = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Vonage: new (opts: any) => any
}> => {
  try {
    const mod = await import('@vonage/server-sdk')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod as any
  } catch (err) {
    throw new SMSProviderError(
      "Install '@vonage/server-sdk' to use the Vonage adapter (pnpm add @vonage/server-sdk)",
      { cause: err },
    )
  }
}

const stripPlus = (n: string): string => n.replace(/^\+/, '')

export const vonageAdapter = (opts: VonageAdapterOptions): SMSAdapter => ({
  name: 'vonage',
  defaultFrom: opts.defaultFrom,
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const { Vonage } = await loadVonage()
    const client = new Vonage({ apiKey: opts.apiKey, apiSecret: opts.apiSecret })

    let response: { messages?: Array<Record<string, string>> }
    try {
      response = await client.sms.send({
        to: stripPlus(message.to),
        from: stripPlus(message.from),
        text: message.body,
      })
    } catch (err) {
      throw new SMSProviderError(`Vonage send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }

    const first = response.messages?.[0]
    if (!first || first.status !== '0') {
      throw new SMSProviderError(
        `Vonage rejected message: status=${first?.status} error=${first?.['error-text'] ?? 'unknown'}`,
      )
    }

    return {
      id: String(first['message-id'] ?? ''),
      provider: 'vonage',
      status: 'sent',
      to: message.to,
      from: message.from,
      body: message.body,
      raw: response,
      sentAt: new Date(),
    }
  },
})
