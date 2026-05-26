import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Payload, PayloadRequest } from 'payload'

import type { SMSStatusEvent, SMSWebhookHandler } from '../types.js'

import { SMSWebhookVerificationError } from '../errors.js'
import { makeWebhookEndpointHandler } from './endpoint.js'

const makeReq = (body: string): PayloadRequest => {
  const enc = new TextEncoder().encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc)
      controller.close()
    },
  })
  const headers = new Headers()
  headers.set('host', 'app.test')
  return {
    body: stream,
    url: 'https://app.test/api/sms/webhooks/twilio',
    headers,
    payload: {
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      find: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
    },
  } as unknown as PayloadRequest
}

const event: SMSStatusEvent = {
  providerMessageId: 'SM1',
  status: 'delivered',
  occurredAt: new Date(),
  raw: {},
}

const stubHandler = (overrides: Partial<SMSWebhookHandler> = {}): SMSWebhookHandler => ({
  verify: vi.fn(),
  parse: vi.fn().mockReturnValue([event]),
  ...overrides,
})

describe('makeWebhookEndpointHandler', () => {
  let payload: Payload

  beforeEach(() => {
    payload = {
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      find: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
    } as unknown as Payload
  })

  test('reads raw body and passes it to verify then parse', async () => {
    const handler = stubHandler()
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true } },
      logsSlug: undefined,
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(handler.verify).toHaveBeenCalledTimes(1)
    expect((handler.verify as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeInstanceOf(
      Buffer,
    )
    expect(handler.parse).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })

  test('returns 403 when verify throws SMSWebhookVerificationError', async () => {
    const handler = stubHandler({
      verify: () => {
        throw new SMSWebhookVerificationError('bad sig')
      },
    })
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true } },
      logsSlug: undefined,
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(res.status).toBe(403)
    expect(handler.parse).not.toHaveBeenCalled()
  })

  test('skips verify when pluginConfig.webhooks.verifySignature is false', async () => {
    const handler = stubHandler({
      verify: vi.fn(() => {
        throw new SMSWebhookVerificationError('would fail')
      }),
    })
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true, verifySignature: false } },
      logsSlug: undefined,
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(handler.verify).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  test('returns 500 when verify throws non-verification error', async () => {
    const handler = stubHandler({
      verify: () => {
        throw new Error('boom')
      },
    })
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true } },
      logsSlug: undefined,
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(res.status).toBe(500)
  })

  test('parses and applies each event then returns 200', async () => {
    const event2 = { ...event, providerMessageId: 'SM2' }
    const handler = stubHandler({
      parse: vi.fn().mockReturnValue([event, event2]),
    })
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true } },
      logsSlug: 'sms-logs',
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(payload.find).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
  })

  test('skips applyStatusEvent when parse returns []', async () => {
    const handler = stubHandler({ parse: vi.fn().mockReturnValue([]) })
    const endpoint = makeWebhookEndpointHandler({
      handler,
      adapterName: 'twilio',
      payload,
      pluginConfig: { webhooks: { enabled: true } },
      logsSlug: 'sms-logs',
      logsIncludeStatusHistory: false,
    })
    const res = await endpoint(makeReq('body=hi'))
    expect(payload.find).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
