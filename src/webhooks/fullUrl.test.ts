import { describe, expect, test } from 'vitest'

import { reconstructFullUrl } from './fullUrl.js'

const makeReq = (
  url: string,
  host: string,
  forwardedProto?: string,
  forwardedHost?: string,
): unknown => {
  const headers = new Headers()
  headers.set('host', host)
  if (forwardedProto) headers.set('x-forwarded-proto', forwardedProto)
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)
  return { url, headers }
}

describe('reconstructFullUrl', () => {
  test('uses req.url host when trustProxy is false', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = makeReq(
      'http://internal:3000/api/sms/webhooks/twilio?x=1',
      'internal:3000',
      'https',
      'app.example.com',
    ) as any
    expect(reconstructFullUrl(req, false)).toBe(
      'http://internal:3000/api/sms/webhooks/twilio?x=1',
    )
  })

  test('overrides with X-Forwarded-Proto + X-Forwarded-Host when trustProxy is true', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = makeReq(
      'http://internal:3000/api/sms/webhooks/twilio?x=1',
      'internal:3000',
      'https',
      'app.example.com',
    ) as any
    expect(reconstructFullUrl(req, true)).toBe(
      'https://app.example.com/api/sms/webhooks/twilio?x=1',
    )
  })

  test('falls back to req.url protocol/host when trustProxy is true but forwarded headers missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = makeReq(
      'https://app.example.com/api/sms/webhooks/twilio',
      'app.example.com',
    ) as any
    expect(reconstructFullUrl(req, true)).toBe(
      'https://app.example.com/api/sms/webhooks/twilio',
    )
  })

  test('preserves query string', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = makeReq(
      'https://app.example.com/api/sms/webhooks/plivo?nonce=abc',
      'app.example.com',
    ) as any
    expect(reconstructFullUrl(req, false)).toBe(
      'https://app.example.com/api/sms/webhooks/plivo?nonce=abc',
    )
  })

  test('parses port out of X-Forwarded-Host when present', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = makeReq(
      'http://internal:3000/api/sms/webhooks/twilio',
      'internal:3000',
      'https',
      'app.example.com:8443',
    ) as any
    expect(reconstructFullUrl(req, true)).toBe(
      'https://app.example.com:8443/api/sms/webhooks/twilio',
    )
  })
})
