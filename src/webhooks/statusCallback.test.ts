import { describe, expect, it } from 'vitest'

import { deriveStatusCallbackUrl } from './statusCallback.js'

describe('deriveStatusCallbackUrl', () => {
  it('builds {serverURL}/api{basePath}/{path}', () => {
    expect(deriveStatusCallbackUrl({ basePath: '/sms/webhooks', serverURL: 'https://x.com', webhookPath: 'twilio' }))
      .toBe('https://x.com/api/sms/webhooks/twilio')
  })
  it('strips a trailing slash on serverURL', () => {
    expect(deriveStatusCallbackUrl({ basePath: '/sms/webhooks', serverURL: 'https://x.com/', webhookPath: 'twilio' }))
      .toBe('https://x.com/api/sms/webhooks/twilio')
  })
  it('returns undefined for localhost / 127.0.0.1 / unset / unparseable', () => {
    for (const s of ['http://localhost:3000', 'http://127.0.0.1:3000', undefined, 'not a url']) {
      expect(deriveStatusCallbackUrl({ basePath: '/sms/webhooks', serverURL: s, webhookPath: 'twilio' })).toBeUndefined()
    }
  })
})
