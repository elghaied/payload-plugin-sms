import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError } from '../../errors.js'

const smsSend = vi.fn()

vi.mock('@vonage/server-sdk', () => {
  class FakeVonage {
    sms = { send: smsSend }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  }
  return { Vonage: FakeVonage }
})

import { vonageAdapter } from './index.js'

describe('vonageAdapter', () => {
  beforeEach(() => {
    smsSend.mockReset()
  })

  test('has name "vonage"', () => {
    const a = vonageAdapter({ apiKey: 'k', apiSecret: 's' })
    expect(a.name).toBe('vonage')
  })

  test('sends via vonage.sms.send and strips leading "+"', async () => {
    smsSend.mockResolvedValue({
      messages: [{ 'message-id': 'vg-1', status: '0' }],
    })
    const a = vonageAdapter({ apiKey: 'k', apiSecret: 's' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(smsSend).toHaveBeenCalledWith({
      to: '15551234567',
      from: '15550000000',
      text: 'hi',
    })
    expect(r.id).toBe('vg-1')
    expect(r.provider).toBe('vonage')
    expect(r.status).toBe('sent')
  })

  test('throws SMSProviderError when Vonage status is non-zero', async () => {
    smsSend.mockResolvedValue({
      messages: [{ status: '4', 'error-text': 'bad credentials' }],
    })
    const a = vonageAdapter({ apiKey: 'k', apiSecret: 's' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })

  test('wraps thrown provider errors', async () => {
    smsSend.mockRejectedValue(new Error('vonage boom'))
    const a = vonageAdapter({ apiKey: 'k', apiSecret: 's' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
