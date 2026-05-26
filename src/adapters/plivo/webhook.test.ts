import type { PayloadRequest } from 'payload'

import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, test } from 'vitest'

import { SMSWebhookVerificationError } from '../../errors.js'
import { makePlivoWebhook } from './webhook.js'

const AUTH_TOKEN = 'test-token'
const URL = 'https://app.test/api/sms/webhooks/plivo'

const sign = (url: string, nonce: string): string =>
  createHmac('sha256', AUTH_TOKEN).update(url + nonce).digest('base64')

const formEncode = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

const makeReq = (sig: string, nonce: string): PayloadRequest => {
  const headers = new Headers()
  headers.set('x-plivo-signature-v3', sig)
  headers.set('x-plivo-signature-v3-nonce', nonce)
  headers.set('host', 'app.test')
  return { headers, url: URL } as unknown as PayloadRequest
}

describe('plivo webhook', () => {
  let webhook: ReturnType<typeof makePlivoWebhook>

  beforeEach(() => {
    webhook = makePlivoWebhook({ authToken: AUTH_TOKEN, trustProxy: false })
  })

  test('verify accepts a correctly-signed request', () => {
    const nonce = 'abc123'
    const sig = sign(URL, nonce)
    expect(() =>
      webhook.verify(
        makeReq(sig, nonce),
        Buffer.from(formEncode({ MessageUUID: 'p1', Status: 'delivered' })),
      ),
    ).not.toThrow()
  })

  test('verify rejects bad signature', () => {
    expect(() =>
      webhook.verify(makeReq('AAAA', 'nonce'), Buffer.from('')),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('verify rejects when sig or nonce header missing', () => {
    const headers = new Headers()
    headers.set('host', 'app.test')
    expect(() =>
      webhook.verify(
        { headers, url: URL } as unknown as PayloadRequest,
        Buffer.from(''),
      ),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('parse extracts MessageUUID, status, errorCode', () => {
    const params = {
      ErrorCode: '4001',
      MessageUUID: 'p1',
      Status: 'delivered',
    }
    const events = webhook.parse(
      makeReq('x', 'x'),
      Buffer.from(formEncode(params)),
    ) as Array<{ errorCode?: string; providerMessageId: string; status: string }>
    expect(events).toHaveLength(1)
    expect(events[0].providerMessageId).toBe('p1')
    expect(events[0].status).toBe('delivered')
    expect(events[0].errorCode).toBe('4001')
  })

  test('parse maps Plivo statuses', () => {
    const cases: Array<[string, string]> = [
      ['queued', 'queued'],
      ['sent', 'sent'],
      ['delivered', 'delivered'],
      ['undelivered', 'failed'],
      ['failed', 'failed'],
      ['unknown-thing', 'unknown'],
    ]
    for (const [pStatus, ours] of cases) {
      const events = webhook.parse(
        makeReq('x', 'x'),
        Buffer.from(formEncode({ MessageUUID: 'p1', Status: pStatus })),
      ) as Array<{ status: string }>
      expect(events[0].status).toBe(ours)
    }
  })
})
