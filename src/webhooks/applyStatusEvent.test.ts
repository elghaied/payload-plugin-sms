import type { Payload, PayloadRequest } from 'payload'

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { applyStatusEvent } from './applyStatusEvent.js'

const stubPayload = (
  existingDoc: null | Record<string, unknown>,
): Payload => {
  const find = vi.fn().mockResolvedValue({
    docs: existingDoc ? [existingDoc] : [],
  })
  const update = vi.fn().mockResolvedValue({ id: 'log-1' })
  return {
    find,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    update,
  } as unknown as Payload
}

const baseEvent = {
  occurredAt: new Date('2026-05-26T12:00:00Z'),
  providerMessageId: 'SM123',
  raw: { ok: true },
  status: 'delivered' as const,
}

const stubReq = () => ({}) as PayloadRequest

describe('applyStatusEvent', () => {
  let payload: Payload

  beforeEach(() => {
    payload = stubPayload({
      id: 'log-1',
      providerMessageId: 'SM123',
      status: 'sent',
    })
  })

  test('looks up by providerMessageId + provider', async () => {
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    expect(payload.find).toHaveBeenCalledWith({
      collection: 'sms-logs',
      limit: 1,
      where: {
        provider: { equals: 'twilio' },
        providerMessageId: { equals: 'SM123' },
      },
    })
  })

  test('updates status, sets deliveredAt when status becomes delivered', async () => {
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.collection).toBe('sms-logs')
    expect(call.id).toBe('log-1')
    expect(call.data.status).toBe('delivered')
    expect(call.data.deliveredAt).toEqual(baseEvent.occurredAt)
    expect(call.data.failedAt).toBeUndefined()
  })

  test('sets failedAt + errorCode + error message when status becomes failed', async () => {
    const event = {
      errorCode: '30005',
      errorMessage: 'Unknown destination',
      occurredAt: new Date(),
      providerMessageId: 'SM123',
      raw: {},
      status: 'failed' as const,
    }
    await applyStatusEvent({
      adapterName: 'twilio',
      event,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.status).toBe('failed')
    expect(call.data.failedAt).toEqual(event.occurredAt)
    expect(call.data.errorCode).toBe('30005')
    expect(call.data.error).toBe('Unknown destination')
  })

  test('drops stale event (delivered -> sent) silently and does not call update', async () => {
    payload = stubPayload({ id: 'log-1', status: 'delivered' })
    await applyStatusEvent({
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'sent' },
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('failed is terminal — later delivered does not overwrite', async () => {
    payload = stubPayload({ id: 'log-1', status: 'failed' })
    await applyStatusEvent({
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'delivered' },
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('missing log row warns and does not throw, returns null log to onStatus', async () => {
    payload = stubPayload(null)
    const onStatus = vi.fn()
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: { onStatus },
      req: stubReq(),
    })
    expect(payload.logger.warn).toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ event: baseEvent, log: null }),
    )
  })

  test('appends statusHistory entry when opted in, even for stale event', async () => {
    payload = stubPayload({
      id: 'log-1',
      status: 'delivered',
      statusHistory: [{ errorCode: null, occurredAt: new Date(), status: 'sent' }],
    })
    await applyStatusEvent({
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'sent' },
      logsIncludeStatusHistory: true,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.statusHistory).toHaveLength(2)
    expect(call.data.statusHistory[1].status).toBe('sent')
    expect(call.data.status).toBeUndefined()
  })

  test('calls onStatus with updated log after DB write', async () => {
    const onStatus = vi.fn()
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: { onStatus },
      req: stubReq(),
    })
    expect(onStatus).toHaveBeenCalledTimes(1)
    const call = onStatus.mock.calls[0][0]
    expect(call.event).toBe(baseEvent)
    expect(call.log).not.toBeNull()
  })

  test('onStatus throwing only warns', async () => {
    const onStatus = vi.fn().mockRejectedValue(new Error('hook boom'))
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: { onStatus },
      req: stubReq(),
    })
    expect(payload.logger.warn).toHaveBeenCalled()
  })

  test('skips DB writes when logsSlug is undefined', async () => {
    await applyStatusEvent({
      adapterName: 'twilio',
      event: baseEvent,
      logsIncludeStatusHistory: false,
      logsSlug: undefined,
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('updates cost when event provides one and existing row has none', async () => {
    payload = stubPayload({ id: 'log-1', cost: undefined, status: 'sent' })
    await applyStatusEvent({
      adapterName: 'twilio',
      event: { ...baseEvent, cost: { amount: '0.0075', currency: 'USD' } },
      logsIncludeStatusHistory: false,
      logsSlug: 'sms-logs',
      payload,
      pluginConfig: {},
      req: stubReq(),
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.cost).toEqual({ amount: '0.0075', currency: 'USD' })
  })
})
