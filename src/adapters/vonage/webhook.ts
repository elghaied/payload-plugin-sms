import { createHmac, timingSafeEqual } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import type { SMSStatus, SMSStatusEvent, SMSWebhookHandler } from '../../types.js'

import { SMSWebhookVerificationError } from '../../errors.js'

export type VonageSignatureMethod = 'sha256hash' | 'sha512hash'

export interface VonageWebhookOptions {
  signatureSecret: string
  signatureMethod: VonageSignatureMethod
}

const STATUS_MAP: Record<string, SMSStatus> = {
  delivered: 'delivered',
  expired: 'failed',
  failed: 'failed',
  rejected: 'failed',
  unknown: 'unknown',
  accepted: 'sent',
  buffered: 'sent',
}

const mapStatus = (s: string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

const algoFor = (m: VonageSignatureMethod): 'sha256' | 'sha512' =>
  m === 'sha512hash' ? 'sha512' : 'sha256'

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

const safeHexEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return timingSafeEqual(ab, bb)
}

export const makeVonageWebhook = (
  opts: VonageWebhookOptions,
): SMSWebhookHandler => ({
  verify(_req: PayloadRequest, rawBody: Buffer): void {
    const params = parseForm(rawBody)
    const sig = params.sig
    if (!sig) {
      throw new SMSWebhookVerificationError('vonage: missing sig param')
    }
    const without: Record<string, string> = { ...params }
    delete without.sig
    const sortedKeys = Object.keys(without).sort()
    const concat = sortedKeys.map((k) => `&${k}=${without[k]}`).join('')
    const expected = createHmac(algoFor(opts.signatureMethod), opts.signatureSecret)
      .update(concat)
      .digest('hex')
    if (!safeHexEqual(sig.toLowerCase(), expected.toLowerCase())) {
      throw new SMSWebhookVerificationError('vonage: signature mismatch')
    }
  },

  parse(_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] {
    const params = parseForm(rawBody)
    const id = params.messageId
    if (!id) return []
    const event: SMSStatusEvent = {
      providerMessageId: id,
      status: mapStatus(params.status),
      occurredAt: new Date(),
      raw: { ...params },
    }
    if (params['err-code']) event.errorCode = params['err-code']
    return [event]
  },
})
