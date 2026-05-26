import type { PayloadRequest } from 'payload'

import { createPublicKey, verify as edVerify } from 'node:crypto'

import type { SMSStatus, SMSStatusEvent, SMSWebhookHandler } from '../../types.js'

import { SMSWebhookVerificationError } from '../../errors.js'

export interface TelnyxWebhookOptions {
  /** Max allowed drift in seconds between Telnyx-Timestamp and now. Default 300. */
  maxDriftSec?: number
  /** PEM-encoded Ed25519 public key from Telnyx portal. */
  publicKey: string
}

const STATUS_MAP: Record<string, SMSStatus> = {
  delivered: 'delivered',
  delivery_failed: 'failed',
  delivery_unconfirmed: 'sent',
  queued: 'queued',
  sending: 'sent',
  sending_failed: 'failed',
  sent: 'sent',
}

const mapStatus = (s: string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

export const makeTelnyxWebhook = (
  opts: TelnyxWebhookOptions,
): SMSWebhookHandler => {
  const publicKey = createPublicKey(opts.publicKey)
  const maxDrift = opts.maxDriftSec ?? 300

  return {
    verify(req: PayloadRequest, rawBody: Buffer): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers = (req as any).headers as Headers
      const sig = headers.get('telnyx-signature-ed25519')
      const ts = headers.get('telnyx-timestamp')
      if (!sig || !ts) {
        throw new SMSWebhookVerificationError(
          'telnyx: missing Telnyx-Signature-Ed25519 or Telnyx-Timestamp header',
        )
      }
      const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
      if (!Number.isFinite(drift) || drift > maxDrift) {
        throw new SMSWebhookVerificationError(
          `telnyx: timestamp drift ${drift}s exceeds max ${maxDrift}s`,
        )
      }
      const message = Buffer.concat([
        Buffer.from(ts),
        Buffer.from('|'),
        rawBody,
      ])
      let ok = false
      try {
        ok = edVerify(null, message, publicKey, Buffer.from(sig, 'base64'))
      } catch {
        ok = false
      }
      if (!ok) {
        throw new SMSWebhookVerificationError('telnyx: signature mismatch')
      }
    },

    parse(_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] {
      if (rawBody.length === 0) {return []}
       
      const json = JSON.parse(rawBody.toString('utf8'))
      const payload = json?.data?.payload
      if (!payload?.id) {return []}
      const errors: Array<{ code?: string; title?: string }> = payload.errors ?? []
      const event: SMSStatusEvent = {
        occurredAt: new Date(),
        providerMessageId: String(payload.id),
        raw: json,
        status: mapStatus(payload.status),
      }
      if (errors[0]?.code) {event.errorCode = String(errors[0].code)}
      if (errors[0]?.title) {event.errorMessage = String(errors[0].title)}
      return [event]
    },
  }
}
