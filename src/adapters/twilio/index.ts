import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSResult,
  SMSStatus,
  SMSWebhookHandler,
} from '../../types.js'

import { SMSProviderError } from '../../errors.js'
import { makeTwilioWebhook } from './webhook.js'

export interface TwilioAdapterOptions {
  accountSid: string
  authToken: string
  defaultFrom?: string
  messagingServiceSid?: string
  webhook?: {
    /** Path segment under basePath; defaults to "twilio". */
    path?: string
    /** Defaults to false; see SMSPluginConfig.webhooks.trustProxy. */
    trustProxy?: boolean
  } | false
}

const STATUS_MAP: Record<string, SMSStatus> = {
  delivered: 'delivered',
  failed: 'failed',
  queued: 'queued',
  received: 'delivered',
  sending: 'sent',
  sent: 'sent',
  undelivered: 'failed',
}

const mapStatus = (s: null | string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

const loadTwilio = async (): Promise<(sid: string, token: string) => unknown> => {
  try {
    const mod = await import('twilio')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (mod as any).default ?? (mod as any)
  } catch (err) {
    throw new SMSProviderError(
      "Install 'twilio' to use the Twilio adapter (pnpm add twilio)",
      { cause: err },
    )
  }
}

const buildWebhook = (opts: TwilioAdapterOptions): SMSWebhookHandler | undefined => {
  if (opts.webhook === false) {return undefined}
  const baseHandler = makeTwilioWebhook({
    authToken: opts.authToken,
    trustProxy: opts.webhook?.trustProxy,
  })
  return opts.webhook?.path
    ? { ...baseHandler, path: opts.webhook.path }
    : baseHandler
}

export const twilioAdapter = (opts: TwilioAdapterOptions): SMSAdapter => ({
  name: 'twilio',
  defaultFrom: opts.defaultFrom,
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const twilio = await loadTwilio()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = twilio(opts.accountSid, opts.authToken) as any

    const payload: Record<string, unknown> = {
      body: message.body,
      to: message.to,
    }
    if (opts.messagingServiceSid) {
      payload.messagingServiceSid = opts.messagingServiceSid
    } else {
      payload.from = message.from
    }
    if (message.mediaUrls?.length) {
      payload.mediaUrl = message.mediaUrls
    }

    try {
      const response = await client.messages.create(payload)
      const sentAt = new Date()
      const result: SMSResult = {
        id: String(response.sid),
        body: message.body,
        from: message.from,
        provider: 'twilio',
        raw: response,
        sentAt,
        status: mapStatus(response.status),
        to: message.to,
      }
      if (response.price && response.priceUnit) {
        result.cost = { amount: String(response.price), currency: String(response.priceUnit) }
      }
      return result
    } catch (err) {
      throw new SMSProviderError(`Twilio send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }
  },
  webhook: buildWebhook(opts),
})
