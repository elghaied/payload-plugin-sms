import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSResult,
  SMSStatus,
  SMSWebhookHandler,
} from '../../types.js'

import { SMSProviderError } from '../../errors.js'
import { makeTelnyxWebhook } from './webhook.js'

export interface TelnyxAdapterOptions {
  apiKey: string
  defaultFrom?: string
  messagingProfileId?: string
  webhook?: {
    /** PEM-encoded Ed25519 public key from Telnyx portal. Required to enable verify. */
    publicKey: string
    path?: string
    maxDriftSec?: number
  } | false
}

const STATUS_MAP: Record<string, SMSStatus> = {
  queued: 'queued',
  sending: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  sending_failed: 'failed',
  delivery_failed: 'failed',
}

const mapStatus = (s: string | null | undefined): SMSStatus => {
  if (!s) return 'queued'
  return STATUS_MAP[s] ?? 'unknown'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadTelnyx = async (): Promise<new (opts: { apiKey: string }) => any> => {
  try {
    const mod = await import('telnyx')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((mod as any).default ?? (mod as any)) as new (opts: { apiKey: string }) => any
  } catch (err) {
    throw new SMSProviderError(
      "Install 'telnyx' to use the Telnyx adapter (pnpm add telnyx)",
      { cause: err },
    )
  }
}

const buildWebhook = (opts: TelnyxAdapterOptions): SMSWebhookHandler | undefined => {
  if (!opts.webhook) return undefined
  const baseHandler = makeTelnyxWebhook({
    publicKey: opts.webhook.publicKey,
    maxDriftSec: opts.webhook.maxDriftSec,
  })
  return opts.webhook.path
    ? { ...baseHandler, path: opts.webhook.path }
    : baseHandler
}

export const telnyxAdapter = (opts: TelnyxAdapterOptions): SMSAdapter => ({
  name: 'telnyx',
  defaultFrom: opts.defaultFrom,
  webhook: buildWebhook(opts),
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const Telnyx = await loadTelnyx()
    const client = new Telnyx({ apiKey: opts.apiKey })

    const payload: Record<string, unknown> = {
      to: message.to,
      from: message.from,
      text: message.body,
    }
    if (message.mediaUrls?.length) {
      payload.media_urls = message.mediaUrls
    }
    if (opts.messagingProfileId) {
      payload.messaging_profile_id = opts.messagingProfileId
    }

    try {
      const response = await client.messages.send(payload)
      const data = response?.data ?? response
      const firstStatus = Array.isArray(data?.to) ? data.to[0]?.status : data?.status
      return {
        id: String(data.id ?? ''),
        provider: 'telnyx',
        status: mapStatus(firstStatus),
        to: message.to,
        from: message.from,
        body: message.body,
        raw: response,
        sentAt: new Date(),
      }
    } catch (err) {
      throw new SMSProviderError(`Telnyx send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }
  },
})
