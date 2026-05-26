import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError, SMSValidationError } from './errors.js'
import { makeSendSMS } from './sendSMS.js'
import { mockAdapter } from './adapters/mock/index.js'
import type { Payload } from 'payload'

const stubPayload = (): Payload => {
  return {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    create: vi.fn().mockResolvedValue({ id: 'log-1' }),
  } as unknown as Payload
}

describe('sendSMS', () => {
  let payload: ReturnType<typeof stubPayload>

  beforeEach(() => {
    payload = stubPayload()
  })

  test('throws SMSValidationError when no adapter configured', async () => {
    const send = makeSendSMS({ payload, pluginConfig: {} })
    await expect(send({ to: '+15551234567', body: 'x' })).rejects.toBeInstanceOf(
      SMSValidationError,
    )
  })

  test('throws SMSValidationError for non-E.164 `to`', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    const send = makeSendSMS({ payload, pluginConfig: { adapter } })
    await expect(send({ to: '5551234567', body: 'x' })).rejects.toBeInstanceOf(
      SMSValidationError,
    )
    await expect(send({ to: '+0551234567', body: 'x' })).rejects.toBeInstanceOf(
      SMSValidationError,
    )
    await expect(send({ to: '', body: 'x' })).rejects.toBeInstanceOf(SMSValidationError)
  })

  test('resolves `from`: message > plugin > adapter', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15559999999' })
    const send = makeSendSMS({
      payload,
      pluginConfig: { adapter, defaultFrom: '+15558888888' },
    })

    const r1 = await send({ to: '+15551234567', from: '+15557777777', body: 'a' })
    expect(r1.from).toBe('+15557777777')

    const r2 = await send({ to: '+15551234567', body: 'b' })
    expect(r2.from).toBe('+15558888888')

    const send2 = makeSendSMS({ payload, pluginConfig: { adapter } })
    const r3 = await send2({ to: '+15551234567', body: 'c' })
    expect(r3.from).toBe('+15559999999')
  })

  test('throws SMSValidationError when no `from` is resolvable', async () => {
    const adapter = mockAdapter() // no defaultFrom
    const send = makeSendSMS({ payload, pluginConfig: { adapter } })
    await expect(send({ to: '+15551234567', body: 'x' })).rejects.toBeInstanceOf(
      SMSValidationError,
    )
  })

  test('writes log entry when logsSlug provided', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    const send = makeSendSMS({
      payload,
      pluginConfig: { adapter },
      logsSlug: 'sms-logs',
    })
    await send({ to: '+15551234567', body: 'hi' })
    expect(payload.create).toHaveBeenCalledTimes(1)
    const call = (payload.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.collection).toBe('sms-logs')
    expect(call.data.to).toBe('+15551234567')
    expect(call.data.provider).toBe('mock')
    expect(call.data.status).toBe('sent')
  })

  test('warns but does not throw when log write fails', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    ;(payload.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    )
    const send = makeSendSMS({
      payload,
      pluginConfig: { adapter },
      logsSlug: 'sms-logs',
    })
    const result = await send({ to: '+15551234567', body: 'hi' })
    expect(result.status).toBe('sent')
    expect(payload.logger.warn).toHaveBeenCalled()
  })

  test('runs onSend hook with result', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    const onSend = vi.fn()
    const send = makeSendSMS({ payload, pluginConfig: { adapter, onSend } })
    await send({ to: '+15551234567', body: 'hi' })
    expect(onSend).toHaveBeenCalledTimes(1)
    const call = onSend.mock.calls[0][0]
    expect(call.result.to).toBe('+15551234567')
    expect(call.req).toBeUndefined()
  })

  test('runs onError hook and rethrows on adapter failure', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000', fail: true })
    const onError = vi.fn()
    const send = makeSendSMS({ payload, pluginConfig: { adapter, onError } })
    await expect(send({ to: '+15551234567', body: 'hi' })).rejects.toBeInstanceOf(
      SMSProviderError,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].error).toBeInstanceOf(SMSProviderError)
    expect(onError.mock.calls[0][0].message.to).toBe('+15551234567')
  })

  test('warns but does not throw when onSend hook itself fails', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    const onSend = vi.fn().mockRejectedValue(new Error('hook boom'))
    const send = makeSendSMS({ payload, pluginConfig: { adapter, onSend } })
    const result = await send({ to: '+15551234567', body: 'hi' })
    expect(result.status).toBe('sent')
    expect(payload.logger.warn).toHaveBeenCalled()
  })
})
