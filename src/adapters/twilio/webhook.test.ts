import { createHmac } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, test } from 'vitest'

import { SMSWebhookVerificationError } from '../../errors.js'
import { makeTwilioWebhook } from './webhook.js'

const AUTH_TOKEN = 'test-token'
const URL = 'https://app.test/api/sms/webhooks/twilio'

const sign = (url: string, params: Record<string, string>): string => {
  const sortedKeys = Object.keys(params).sort()
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url)
  return createHmac('sha1', AUTH_TOKEN).update(data).digest('base64')
}

const formEncode = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

const makeReq = (params: Record<string, string>, sig: string): PayloadRequest => {
  const headers = new Headers()
  headers.set('x-twilio-signature', sig)
  headers.set('host', 'app.test')
  return {
    url: URL,
    headers,
  } as unknown as PayloadRequest
}

describe('twilio webhook', () => {
  let webhook: ReturnType<typeof makeTwilioWebhook>

  beforeEach(() => {
    webhook = makeTwilioWebhook({ authToken: AUTH_TOKEN, trustProxy: false })
  })

  test('verify accepts a correctly-signed request', () => {
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' }
    const sig = sign(URL, params)
    expect(() =>
      webhook.verify(makeReq(params, sig), Buffer.from(formEncode(params))),
    ).not.toThrow()
  })

  test('verify throws SMSWebhookVerificationError on bad signature', () => {
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' }
    expect(() =>
      webhook.verify(makeReq(params, 'wrong'), Buffer.from(formEncode(params))),
    ).toThrow(SMSWebhookVerificationError)
  })

  test('verify throws when signature header is missing', () => {
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' }
    const headers = new Headers()
    headers.set('host', 'app.test')
    const req = { url: URL, headers } as unknown as PayloadRequest
    expect(() => webhook.verify(req, Buffer.from(formEncode(params)))).toThrow(
      SMSWebhookVerificationError,
    )
  })

  test('parse extracts providerMessageId, mapped status, errorCode', () => {
    const params = {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
      ErrorCode: '30005',
    }
    const events = webhook.parse(
      makeReq(params, 'irrelevant'),
      Buffer.from(formEncode(params)),
    ) as ReturnType<typeof webhook.parse>
    const arr = events as Array<{
      providerMessageId: string
      status: string
      errorCode?: string
    }>
    expect(arr).toHaveLength(1)
    expect(arr[0].providerMessageId).toBe('SM1')
    expect(arr[0].status).toBe('delivered')
    expect(arr[0].errorCode).toBe('30005')
  })

  test('parse maps Twilio statuses', () => {
    const cases: Array<[string, string]> = [
      ['queued', 'queued'],
      ['sending', 'sent'],
      ['sent', 'sent'],
      ['delivered', 'delivered'],
      ['undelivered', 'failed'],
      ['failed', 'failed'],
      ['weird-new-status', 'unknown'],
    ]
    for (const [twStatus, ours] of cases) {
      const params = { MessageSid: 'SM1', MessageStatus: twStatus }
      const result = webhook.parse(
        makeReq(params, 'irrelevant'),
        Buffer.from(formEncode(params)),
      ) as Array<{ status: string }>
      expect(result[0].status).toBe(ours)
    }
  })

  test('verify with trustProxy uses X-Forwarded-Proto + X-Forwarded-Host', () => {
    const wh = makeTwilioWebhook({ authToken: AUTH_TOKEN, trustProxy: true })
    const forwardedUrl = 'https://app.example.com/api/sms/webhooks/twilio'
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' }
    const sig = sign(forwardedUrl, params)
    const headers = new Headers()
    headers.set('x-twilio-signature', sig)
    headers.set('host', 'internal:3000')
    headers.set('x-forwarded-proto', 'https')
    headers.set('x-forwarded-host', 'app.example.com')
    const req = {
      url: 'http://internal:3000/api/sms/webhooks/twilio',
      headers,
    } as unknown as PayloadRequest
    expect(() => wh.verify(req, Buffer.from(formEncode(params)))).not.toThrow()
  })
})
