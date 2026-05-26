import type { PayloadRequest } from 'payload'

import { sign as edSign, generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, test } from 'vitest'

import { SMSWebhookVerificationError } from '../../errors.js'
import { makeTelnyxWebhook } from './webhook.js'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicKeyB64 = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const signTelnyx = (timestamp: string, body: string): string => {
  const message = Buffer.from(`${timestamp}|${body}`)
  const sig = edSign(null, message, privateKey)
  return sig.toString('base64')
}

const makeReq = (sig: string, timestamp: string): PayloadRequest => {
  const headers = new Headers()
  headers.set('telnyx-signature-ed25519', sig)
  headers.set('telnyx-timestamp', timestamp)
  return { headers } as unknown as PayloadRequest
}

const NOW = () => Math.floor(Date.now() / 1000).toString()

describe('telnyx webhook', () => {
  let webhook: ReturnType<typeof makeTelnyxWebhook>

  beforeEach(() => {
    webhook = makeTelnyxWebhook({ publicKey: publicKeyB64 })
  })

  test('verify accepts a correctly-signed request', () => {
    const ts = NOW()
    const body = '{"data":{"payload":{"id":"tx1","status":"delivered"}}}'
    const sig = signTelnyx(ts, body)
    expect(() => webhook.verify(makeReq(sig, ts), Buffer.from(body))).not.toThrow()
  })

  test('verify rejects bad signature', () => {
    const ts = NOW()
    const body = '{"data":{"payload":{"id":"tx1","status":"delivered"}}}'
    expect(() =>
      webhook.verify(makeReq('AAAA', ts), Buffer.from(body)),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('verify rejects timestamp drift > 5 min', () => {
    const stale = (Math.floor(Date.now() / 1000) - 600).toString()
    const body = '{"x":1}'
    const sig = signTelnyx(stale, body)
    expect(() =>
      webhook.verify(makeReq(sig, stale), Buffer.from(body)),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('verify rejects when timestamp header missing', () => {
    const headers = new Headers()
    headers.set('telnyx-signature-ed25519', 'AAAA')
    expect(() =>
      webhook.verify(
        { headers } as unknown as PayloadRequest,
        Buffer.from(''),
      ),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('parse extracts providerMessageId and mapped status', async () => {
    const body = JSON.stringify({
      data: {
        event_type: 'message.finalized',
        payload: { id: 'tx1', status: 'delivered' },
      },
    })
    const events = (await webhook.parse(
      {} as PayloadRequest,
      Buffer.from(body),
    )) as Array<{ providerMessageId: string; status: string }>
    expect(events).toHaveLength(1)
    expect(events[0].providerMessageId).toBe('tx1')
    expect(events[0].status).toBe('delivered')
  })

  test('parse maps Telnyx statuses', async () => {
    const cases: Array<[string, string]> = [
      ['queued', 'queued'],
      ['sending', 'sent'],
      ['sent', 'sent'],
      ['delivered', 'delivered'],
      ['sending_failed', 'failed'],
      ['delivery_failed', 'failed'],
      ['weird', 'unknown'],
    ]
    for (const [tStatus, ours] of cases) {
      const body = JSON.stringify({
        data: { payload: { id: 'tx1', status: tStatus } },
      })
      const events = (await webhook.parse(
        {} as PayloadRequest,
        Buffer.from(body),
      )) as Array<{ status: string }>
      expect(events[0].status).toBe(ours)
    }
  })
})
