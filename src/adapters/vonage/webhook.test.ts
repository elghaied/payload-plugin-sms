import type { PayloadRequest } from 'payload'

import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, test } from 'vitest'

import { SMSWebhookVerificationError } from '../../errors.js'
import { makeVonageWebhook } from './webhook.js'

const SECRET = 'shh'

const signSorted = (
  params: Record<string, string>,
  method: 'sha256' | 'sha512',
): string => {
  const sortedKeys = Object.keys(params).sort()
  const concat = sortedKeys.map((k) => `&${k}=${params[k]}`).join('')
  return createHmac(method, SECRET).update(concat).digest('hex')
}

const formEncode = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

const makeReq = (): PayloadRequest => {
  const headers = new Headers()
  headers.set('host', 'app.test')
  return {
    headers,
    url: 'https://app.test/api/sms/webhooks/vonage',
  } as unknown as PayloadRequest
}

describe('vonage webhook', () => {
  let webhook: ReturnType<typeof makeVonageWebhook>

  beforeEach(() => {
    webhook = makeVonageWebhook({
      signatureMethod: 'sha256hash',
      signatureSecret: SECRET,
    })
  })

  test('verify accepts a correctly-signed sha256 request', () => {
    const params = { 'message-timestamp': '2026-05-26 12:00:00', messageId: 'vg1', status: 'delivered' }
    const sig = signSorted(params, 'sha256')
    const body = formEncode({ ...params, sig })
    expect(() => webhook.verify(makeReq(), Buffer.from(body))).not.toThrow()
  })

  test('verify rejects bad signature', () => {
    const params = { messageId: 'vg1', status: 'delivered' }
    const body = formEncode({ ...params, sig: 'badhex' })
    expect(() => webhook.verify(makeReq(), Buffer.from(body))).toThrow(
      SMSWebhookVerificationError,
    )
  })

  test('verify rejects when `sig` param is absent', () => {
    const body = formEncode({ messageId: 'vg1', status: 'delivered' })
    expect(() => webhook.verify(makeReq(), Buffer.from(body))).toThrow(
      SMSWebhookVerificationError,
    )
  })

  test('verify accepts sha512 when configured', () => {
    const wh = makeVonageWebhook({
      signatureMethod: 'sha512hash',
      signatureSecret: SECRET,
    })
    const params = { messageId: 'vg1', status: 'delivered' }
    const sig = signSorted(params, 'sha512')
    const body = formEncode({ ...params, sig })
    expect(() => wh.verify(makeReq(), Buffer.from(body))).not.toThrow()
  })

  test('parse extracts messageId, status, err-code', () => {
    const body = formEncode({
      'err-code': '0',
      messageId: 'vg1',
      sig: 'whatever',
      status: 'delivered',
    })
    const events = webhook.parse(makeReq(), Buffer.from(body)) as Array<{
      errorCode?: string
      providerMessageId: string
      status: string
    }>
    expect(events).toHaveLength(1)
    expect(events[0].providerMessageId).toBe('vg1')
    expect(events[0].status).toBe('delivered')
    expect(events[0].errorCode).toBe('0')
  })

  test('parse maps Vonage statuses', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'delivered'],
      ['expired', 'failed'],
      ['failed', 'failed'],
      ['rejected', 'failed'],
      ['unknown', 'unknown'],
    ]
    for (const [vStatus, ours] of cases) {
      const body = formEncode({ messageId: 'vg1', sig: 'x', status: vStatus })
      const events = webhook.parse(makeReq(), Buffer.from(body)) as Array<{
        status: string
      }>
      expect(events[0].status).toBe(ours)
    }
  })
})
