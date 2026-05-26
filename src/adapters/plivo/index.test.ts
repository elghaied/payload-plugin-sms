import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError } from '../../errors.js'

const messagesCreate = vi.fn()

vi.mock('plivo', () => {
  class FakeClient {
    messages = { create: messagesCreate }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_id: string, _token: string) {}
  }
  return { default: { Client: FakeClient }, Client: FakeClient }
})

import { plivoAdapter } from './index.js'

describe('plivoAdapter', () => {
  beforeEach(() => {
    messagesCreate.mockReset()
  })

  test('has name "plivo"', () => {
    const a = plivoAdapter({ authId: 'a', authToken: 't' })
    expect(a.name).toBe('plivo')
  })

  test('sends via client.messages.create with src/dst/text', async () => {
    messagesCreate.mockResolvedValue({ messageUuid: ['uuid-1'], message: 'queued' })
    const a = plivoAdapter({ authId: 'a', authToken: 't' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(messagesCreate).toHaveBeenCalledWith({
      src: '+15550000000',
      dst: '+15551234567',
      text: 'hi',
    })
    expect(r.id).toBe('uuid-1')
    expect(r.provider).toBe('plivo')
    expect(r.status).toBe('queued')
  })

  test('treats string messageUuid as single id', async () => {
    messagesCreate.mockResolvedValue({ messageUuid: 'uuid-x', message: 'queued' })
    const a = plivoAdapter({ authId: 'a', authToken: 't' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(r.id).toBe('uuid-x')
  })

  test('forwards media as MMS', async () => {
    messagesCreate.mockResolvedValue({ messageUuid: 'u' })
    const a = plivoAdapter({ authId: 'a', authToken: 't' })
    await a.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
      mediaUrls: ['https://x/a.png'],
    })
    const call = messagesCreate.mock.calls[0][0]
    expect(call.type).toBe('mms')
    expect(call.media_urls).toEqual(['https://x/a.png'])
  })

  test('wraps provider errors', async () => {
    messagesCreate.mockRejectedValue(new Error('plivo boom'))
    const a = plivoAdapter({ authId: 'a', authToken: 't' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
