import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError } from '../../errors.js'

const messagesCreate = vi.fn()

vi.mock('twilio', () => {
  const factory = vi.fn(() => ({
    messages: { create: messagesCreate },
  }))
  return { default: factory }
})

import { twilioAdapter } from './index.js'

describe('twilioAdapter', () => {
  beforeEach(() => {
    messagesCreate.mockReset()
  })

  test('has name "twilio"', () => {
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    expect(a.name).toBe('twilio')
  })

  test('sends via client.messages.create with body and from', async () => {
    messagesCreate.mockResolvedValue({
      sid: 'SM123',
      status: 'queued',
      price: null,
      priceUnit: null,
    })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't', defaultFrom: '+1' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(messagesCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      body: 'hi',
      from: '+15550000000',
    })
    expect(r.id).toBe('SM123')
    expect(r.provider).toBe('twilio')
    expect(r.status).toBe('queued')
  })

  test('uses messagingServiceSid when provided, omits from', async () => {
    messagesCreate.mockResolvedValue({ sid: 'SM1', status: 'queued' })
    const a = twilioAdapter({
      accountSid: 'AC',
      authToken: 't',
      messagingServiceSid: 'MG1',
    })
    await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    const call = messagesCreate.mock.calls[0][0]
    expect(call.messagingServiceSid).toBe('MG1')
    expect(call.from).toBeUndefined()
  })

  test('forwards media URLs as mediaUrl array', async () => {
    messagesCreate.mockResolvedValue({ sid: 'SM1', status: 'queued' })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    await a.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
      mediaUrls: ['https://x/a.png'],
    })
    expect(messagesCreate.mock.calls[0][0].mediaUrl).toEqual(['https://x/a.png'])
  })

  test('maps Twilio status to internal enum', async () => {
    const cases: Array<[string, string]> = [
      ['queued', 'queued'],
      ['sending', 'sent'],
      ['sent', 'sent'],
      ['delivered', 'delivered'],
      ['received', 'delivered'],
      ['failed', 'failed'],
      ['undelivered', 'failed'],
      ['whatever', 'unknown'],
    ]
    for (const [twStatus, ours] of cases) {
      messagesCreate.mockResolvedValueOnce({ sid: 'SM', status: twStatus })
      const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
      const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
      expect(r.status).toBe(ours)
    }
  })

  test('populates cost when Twilio returns price', async () => {
    messagesCreate.mockResolvedValue({
      sid: 'SM',
      status: 'sent',
      price: '-0.0075',
      priceUnit: 'USD',
    })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
    expect(r.cost).toEqual({ amount: '-0.0075', currency: 'USD' })
  })

  test('wraps provider errors in SMSProviderError', async () => {
    messagesCreate.mockRejectedValue(new Error('twilio boom'))
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
