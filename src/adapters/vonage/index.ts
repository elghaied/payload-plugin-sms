import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSResult,
  SMSWebhookHandler,
} from '../../types.js'

import { SMSProviderError } from '../../errors.js'
import { makeVonageWebhook, type VonageSignatureMethod } from './webhook.js'

export interface VonageAdapterOptions {
  apiKey: string
  apiSecret: string
  defaultFrom?: string
  webhook?: {
    path?: string
    signatureMethod: VonageSignatureMethod
    signatureSecret: string
  } | false
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

const buildWebhook = (opts: VonageAdapterOptions): SMSWebhookHandler | undefined => {
  if (!opts.webhook) {return undefined}
  if (opts.webhook.signatureMethod !== 'sha256hash' && opts.webhook.signatureMethod !== 'sha512hash') {
    throw new SMSProviderError(
      `Vonage signatureMethod "${String(opts.webhook.signatureMethod)}" is not supported. Use 'sha256hash' or 'sha512hash'. Plain MD5 is insecure and intentionally not supported.`,
    )
  }
  const baseHandler = makeVonageWebhook({
    signatureMethod: opts.webhook.signatureMethod,
    signatureSecret: opts.webhook.signatureSecret,
  })
  return opts.webhook.path
    ? { ...baseHandler, path: opts.webhook.path }
    : baseHandler
}

export const vonageAdapter = (opts: VonageAdapterOptions): SMSAdapter => ({
  name: 'vonage',
  defaultFrom: opts.defaultFrom,
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const { Vonage } = await loadVonage()
    const client = new Vonage({ apiKey: opts.apiKey, apiSecret: opts.apiSecret })

    let response: { messages?: Array<Record<string, string>> }
    try {
      response = await client.sms.send({
        from: stripPlus(message.from),
        text: message.body,
        to: stripPlus(message.to),
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
      body: message.body,
      from: message.from,
      provider: 'vonage',
      raw: response,
      sentAt: new Date(),
      status: 'sent',
      to: message.to,
    }
  },
  webhook: buildWebhook(opts),
})
