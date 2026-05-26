import { createHmac, timingSafeEqual } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import type { SMSStatus, SMSStatusEvent, SMSWebhookHandler } from '../../types.js'

import { SMSWebhookVerificationError } from '../../errors.js'
import { reconstructFullUrl } from '../../webhooks/fullUrl.js'

export interface PlivoWebhookOptions {
  authToken: string
  trustProxy?: boolean
}

const STATUS_MAP: Record<string, SMSStatus> = {
  queued: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  undelivered: 'failed',
  failed: 'failed',
  rejected: 'failed',
}

const mapStatus = (s: string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

const parseForm = (raw: Buffer): Record<string, string> => {
  const text = raw.toString('utf8')
  const out: Record<string, string> = {}
  for (const pair of text.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const k = eq === -1 ? pair : pair.slice(0, eq)
    const v = eq === -1 ? '' : pair.slice(eq + 1)
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(
      v.replace(/\+/g, ' '),
    )
  }
  return out
}

export const makePlivoWebhook = (
  opts: PlivoWebhookOptions,
): SMSWebhookHandler => ({
  verify(req: PayloadRequest, _rawBody: Buffer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (req as any).headers as Headers
    const sig = headers.get('x-plivo-signature-v3')
    const nonce = headers.get('x-plivo-signature-v3-nonce')
    if (!sig || !nonce) {
      throw new SMSWebhookVerificationError(
        'plivo: missing X-Plivo-Signature-V3 or X-Plivo-Signature-V3-Nonce header',
      )
    }
    const fullUrl = reconstructFullUrl(req, Boolean(opts.trustProxy))
    const expected = createHmac('sha256', opts.authToken)
      .update(fullUrl + nonce)
      .digest('base64')
    if (!safeEqual(sig, expected)) {
      throw new SMSWebhookVerificationError('plivo: signature mismatch')
    }
  },

  parse(_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] {
    const params = parseForm(rawBody)
    const uuid = params.MessageUUID
    if (!uuid) return []
    const event: SMSStatusEvent = {
      providerMessageId: uuid,
      status: mapStatus(params.Status),
      occurredAt: new Date(),
      raw: { ...params },
    }
    if (params.ErrorCode) event.errorCode = params.ErrorCode
    return [event]
  },
})
