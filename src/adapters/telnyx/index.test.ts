import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError } from '../../errors.js'

const messagesSend = vi.fn()

vi.mock('telnyx', () => {
  class FakeTelnyx {
    messages = { send: messagesSend }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  }
  return { default: FakeTelnyx }
})

import { telnyxAdapter } from './index.js'

describe('telnyxAdapter', () => {
  beforeEach(() => {
    messagesSend.mockReset()
  })

  test('has name "telnyx"', () => {
    const a = telnyxAdapter({ apiKey: 'k' })
    expect(a.name).toBe('telnyx')
  })

  test('sends via client.messages.send with text and from', async () => {
    messagesSend.mockResolvedValue({
      data: { id: 'msg-1', to: [{ status: 'queued' }] },
    })
    const a = telnyxAdapter({ apiKey: 'k' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(messagesSend).toHaveBeenCalledWith({
      to: '+15551234567',
      from: '+15550000000',
      text: 'hi',
    })
    expect(r.id).toBe('msg-1')
    expect(r.provider).toBe('telnyx')
    expect(r.status).toBe('queued')
  })

  test('forwards media_urls', async () => {
    messagesSend.mockResolvedValue({ data: { id: 'm', to: [{ status: 'queued' }] } })
    const a = telnyxAdapter({ apiKey: 'k' })
    await a.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
      mediaUrls: ['https://x/a.png'],
    })
    expect(messagesSend.mock.calls[0][0].media_urls).toEqual(['https://x/a.png'])
  })

  test('passes messaging_profile_id when configured', async () => {
    messagesSend.mockResolvedValue({ data: { id: 'm', to: [{ status: 'queued' }] } })
    const a = telnyxAdapter({ apiKey: 'k', messagingProfileId: 'mp-1' })
    await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(messagesSend.mock.calls[0][0].messaging_profile_id).toBe('mp-1')
  })

  test('maps status to internal enum', async () => {
    const cases: Array<[string, string]> = [
      ['queued', 'queued'],
      ['sending', 'sent'],
      ['sent', 'sent'],
      ['delivered', 'delivered'],
      ['sending_failed', 'failed'],
      ['delivery_failed', 'failed'],
      ['whatever', 'unknown'],
    ]
    for (const [tStatus, ours] of cases) {
      messagesSend.mockResolvedValueOnce({ data: { id: 'm', to: [{ status: tStatus }] } })
      const a = telnyxAdapter({ apiKey: 'k' })
      const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
      expect(r.status).toBe(ours)
    }
  })

  test('defaults to "queued" when status not present', async () => {
    messagesSend.mockResolvedValue({ data: { id: 'm' } })
    const a = telnyxAdapter({ apiKey: 'k' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
    expect(r.status).toBe('queued')
  })

  test('wraps provider errors', async () => {
    messagesSend.mockRejectedValue(new Error('telnyx boom'))
    const a = telnyxAdapter({ apiKey: 'k' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
