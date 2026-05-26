import type { PayloadRequest } from 'payload'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { SMSStatus, SMSStatusEvent, SMSWebhookHandler } from '../../types.js'

import { SMSWebhookVerificationError } from '../../errors.js'
import { reconstructFullUrl } from '../../webhooks/fullUrl.js'

export interface TwilioWebhookOptions {
  authToken: string
  trustProxy?: boolean
}

const STATUS_MAP: Record<string, SMSStatus> = {
  accepted: 'queued',
  delivered: 'delivered',
  failed: 'failed',
  queued: 'queued',
  received: 'delivered',
  scheduled: 'queued',
  sending: 'sent',
  sent: 'sent',
  undelivered: 'failed',
}

const mapStatus = (s: null | string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {return false}
  return timingSafeEqual(ab, bb)
}

export const makeTwilioWebhook = (
  opts: TwilioWebhookOptions,
): SMSWebhookHandler => ({
  verify(req: PayloadRequest, rawBody: Buffer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = ((req as any).headers as Headers).get('x-twilio-signature')
    if (!sig) {
      throw new SMSWebhookVerificationError('twilio: missing X-Twilio-Signature header')
    }
    const fullUrl = reconstructFullUrl(req, Boolean(opts.trustProxy))
    const params = parseForm(rawBody)
    const sorted = Object.keys(params).sort()
    const data = sorted.reduce((acc, k) => acc + k + params[k], fullUrl)
    const expected = createHmac('sha1', opts.authToken).update(data).digest('base64')
    if (!safeEqual(sig, expected)) {
      throw new SMSWebhookVerificationError('twilio: signature mismatch')
    }
  },

  parse(_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] {
    const params = parseForm(rawBody)
    const sid = params.MessageSid
    if (!sid) {return []}
    const event: SMSStatusEvent = {
      occurredAt: new Date(),
      providerMessageId: sid,
      raw: { ...params },
      status: mapStatus(params.MessageStatus),
    }
    if (params.ErrorCode) {event.errorCode = params.ErrorCode}
    if (params.ErrorMessage) {event.errorMessage = params.ErrorMessage}
    return [event]
  },
})

const parseForm = (raw: Buffer): Record<string, string> => {
  const text = raw.toString('utf8')
  const out: Record<string, string> = {}
  for (const pair of text.split('&')) {
    if (!pair) {continue}
    const eq = pair.indexOf('=')
    const k = eq === -1 ? pair : pair.slice(0, eq)
    const v = eq === -1 ? '' : pair.slice(eq + 1)
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(
      v.replace(/\+/g, ' '),
    )
  }
  return out
}
