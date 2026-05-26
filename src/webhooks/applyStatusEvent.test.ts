import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

import { applyStatusEvent } from './applyStatusEvent.js'

const stubPayload = (
  existingDoc: Record<string, unknown> | null,
): Payload => {
  const find = vi.fn().mockResolvedValue({
    docs: existingDoc ? [existingDoc] : [],
  })
  const update = vi.fn().mockResolvedValue({ id: 'log-1' })
  return {
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    find,
    update,
  } as unknown as Payload
}

const baseEvent = {
  providerMessageId: 'SM123',
  status: 'delivered' as const,
  occurredAt: new Date('2026-05-26T12:00:00Z'),
  raw: { ok: true },
}

const stubReq = () => ({}) as PayloadRequest

describe('applyStatusEvent', () => {
  let payload: Payload

  beforeEach(() => {
    payload = stubPayload({
      id: 'log-1',
      status: 'sent',
      providerMessageId: 'SM123',
    })
  })

  test('looks up by providerMessageId + provider', async () => {
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(payload.find).toHaveBeenCalledWith({
      collection: 'sms-logs',
      where: {
        providerMessageId: { equals: 'SM123' },
        provider: { equals: 'twilio' },
      },
      limit: 1,
    })
  })

  test('updates status, sets deliveredAt when status becomes delivered', async () => {
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
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
      providerMessageId: 'SM123',
      status: 'failed' as const,
      errorCode: '30005',
      errorMessage: 'Unknown destination',
      occurredAt: new Date(),
      raw: {},
    }
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event,
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
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
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'sent' },
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('failed is terminal — later delivered does not overwrite', async () => {
    payload = stubPayload({ id: 'log-1', status: 'failed' })
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'delivered' },
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('missing log row warns and does not throw, returns null log to onStatus', async () => {
    payload = stubPayload(null)
    const onStatus = vi.fn()
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: { onStatus },
      req: stubReq(),
      logsIncludeStatusHistory: false,
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
      statusHistory: [{ status: 'sent', occurredAt: new Date(), errorCode: null }],
    })
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: { ...baseEvent, status: 'sent' },
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: true,
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.statusHistory).toHaveLength(2)
    expect(call.data.statusHistory[1].status).toBe('sent')
    expect(call.data.status).toBeUndefined()
  })

  test('calls onStatus with updated log after DB write', async () => {
    const onStatus = vi.fn()
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: { onStatus },
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(onStatus).toHaveBeenCalledTimes(1)
    const call = onStatus.mock.calls[0][0]
    expect(call.event).toBe(baseEvent)
    expect(call.log).not.toBeNull()
  })

  test('onStatus throwing only warns', async () => {
    const onStatus = vi.fn().mockRejectedValue(new Error('hook boom'))
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: { onStatus },
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(payload.logger.warn).toHaveBeenCalled()
  })

  test('skips DB writes when logsSlug is undefined', async () => {
    await applyStatusEvent({
      payload,
      logsSlug: undefined,
      adapterName: 'twilio',
      event: baseEvent,
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  test('updates cost when event provides one and existing row has none', async () => {
    payload = stubPayload({ id: 'log-1', status: 'sent', cost: undefined })
    await applyStatusEvent({
      payload,
      logsSlug: 'sms-logs',
      adapterName: 'twilio',
      event: { ...baseEvent, cost: { amount: '0.0075', currency: 'USD' } },
      pluginConfig: {},
      req: stubReq(),
      logsIncludeStatusHistory: false,
    })
    const call = (payload.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.cost).toEqual({ amount: '0.0075', currency: 'USD' })
  })
})
