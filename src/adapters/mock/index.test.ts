import { describe, expect, test } from 'vitest'

import { SMSProviderError } from '../../errors.js'
import { mockAdapter } from './index.js'

describe('mockAdapter', () => {
  test('has name "mock"', () => {
    const adapter = mockAdapter()
    expect(adapter.name).toBe('mock')
  })

  test('exposes defaultFrom from options', () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    expect(adapter.defaultFrom).toBe('+15550000000')
  })

  test('records sent messages and returns SMSResult', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    const result = await adapter.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hello',
    })
    expect(result.provider).toBe('mock')
    expect(result.status).toBe('sent')
    expect(result.to).toBe('+15551234567')
    expect(result.from).toBe('+15550000000')
    expect(result.body).toBe('hello')
    expect(result.id).toMatch(/^mock-\d+$/)
    expect(result.sentAt).toBeInstanceOf(Date)
    expect(adapter.messages).toHaveLength(1)
    expect(adapter.messages[0].body).toBe('hello')
  })

  test('reset() clears recorded messages', async () => {
    const adapter = mockAdapter()
    await adapter.send({ to: '+15551234567', from: '+15550000000', body: 'a' })
    expect(adapter.messages).toHaveLength(1)
    adapter.reset()
    expect(adapter.messages).toHaveLength(0)
  })

  test('respects fail option', async () => {
    const adapter = mockAdapter({ fail: true })
    await expect(
      adapter.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })

  test('respects status override', async () => {
    const adapter = mockAdapter({ status: 'delivered' })
    const result = await adapter.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'x',
    })
    expect(result.status).toBe('delivered')
  })
})
