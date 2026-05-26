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
      price: null,
      priceUnit: null,
      sid: 'SM123',
      status: 'queued',
    })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't', defaultFrom: '+1' })
    const r = await a.send({ body: 'hi', from: '+15550000000', to: '+15551234567' })
    expect(messagesCreate).toHaveBeenCalledWith({
      body: 'hi',
      from: '+15550000000',
      to: '+15551234567',
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
    await a.send({ body: 'hi', from: '+15550000000', to: '+15551234567' })
    const call = messagesCreate.mock.calls[0][0]
    expect(call.messagingServiceSid).toBe('MG1')
    expect(call.from).toBeUndefined()
  })

  test('forwards media URLs as mediaUrl array', async () => {
    messagesCreate.mockResolvedValue({ sid: 'SM1', status: 'queued' })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    await a.send({
      body: 'hi',
      from: '+15550000000',
      mediaUrls: ['https://x/a.png'],
      to: '+15551234567',
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
      const r = await a.send({ body: 'x', from: '+15550000000', to: '+15551234567' })
      expect(r.status).toBe(ours)
    }
  })

  test('populates cost when Twilio returns price', async () => {
    messagesCreate.mockResolvedValue({
      price: '-0.0075',
      priceUnit: 'USD',
      sid: 'SM',
      status: 'sent',
    })
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    const r = await a.send({ body: 'x', from: '+15550000000', to: '+15551234567' })
    expect(r.cost).toEqual({ amount: '-0.0075', currency: 'USD' })
  })

  test('wraps provider errors in SMSProviderError', async () => {
    messagesCreate.mockRejectedValue(new Error('twilio boom'))
    const a = twilioAdapter({ accountSid: 'AC', authToken: 't' })
    await expect(
      a.send({ body: 'x', from: '+15550000000', to: '+15551234567' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
