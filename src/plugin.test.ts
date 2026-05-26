import type { Config, Payload } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { mockAdapter } from './adapters/mock/index.js'
import { smsPlugin } from './plugin.js'

const baseConfig = (): Config =>
  ({
    collections: [],
    secret: 'test',
  }) as unknown as Config

const runOnInit = async (config: Config): Promise<Payload> => {
  const payload = {
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    create: vi.fn().mockResolvedValue({ id: 'log-1' }),
  } as unknown as Payload
  if (config.onInit) {
    await config.onInit(payload)
  }
  return payload
}

describe('smsPlugin', () => {
  test('adds sms-logs collection when collections.logs is true', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: true },
    })(baseConfig()) as Config
    const slugs = (result.collections ?? []).map((c) => c.slug)
    expect(slugs).toContain('sms-logs')
  })

  test('does not add sms-logs collection when logs disabled', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
    })(baseConfig()) as Config
    const slugs = (result.collections ?? []).map((c) => c.slug)
    expect(slugs).not.toContain('sms-logs')
  })

  test('honors slug override', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: { slug: 'audit-sms' } },
    })(baseConfig()) as Config
    const slugs = (result.collections ?? []).map((c) => c.slug)
    expect(slugs).toContain('audit-sms')
  })

  test('registers dashboard widget when logs+widgets enabled', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: true },
      widgets: true,
    })(baseConfig()) as Config
    const widgets = result.admin?.dashboard?.widgets ?? []
    expect(widgets.some((w) => w.slug === 'sms-recent-logs')).toBe(true)
  })

  test('does not register widget when widgets:false', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: true },
      widgets: false,
    })(baseConfig()) as Config
    const widgets = result.admin?.dashboard?.widgets ?? []
    expect(widgets.find((w) => w.slug === 'sms-recent-logs')).toBeUndefined()
  })

  test('does not register widget when slug is overridden', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: { slug: 'audit-sms' } },
      widgets: true,
    })(baseConfig()) as Config
    const widgets = result.admin?.dashboard?.widgets ?? []
    expect(widgets.find((w) => w.slug === 'sms-recent-logs')).toBeUndefined()
  })

  test('does not register widget when logs disabled', () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      widgets: true,
    })(baseConfig()) as Config
    const widgets = result.admin?.dashboard?.widgets ?? []
    expect(widgets.find((w) => w.slug === 'sms-recent-logs')).toBeUndefined()
  })

  test('attaches sendSMS to payload via onInit', async () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
    })(baseConfig()) as Config
    const payload = await runOnInit(result)
    expect(typeof (payload as unknown as { sendSMS: unknown }).sendSMS).toBe('function')

    const sendResult = await (
      payload as unknown as {
        sendSMS: (m: { to: string; body: string }) => Promise<{ status: string }>
      }
    ).sendSMS({ to: '+15551234567', body: 'hi' })
    expect(sendResult.status).toBe('sent')
  })

  test('preserves existing onInit', async () => {
    const existing = vi.fn()
    const config = baseConfig()
    config.onInit = existing
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
    })(config) as Config
    await runOnInit(result)
    expect(existing).toHaveBeenCalledTimes(1)
  })

  test('warns at onInit when no adapter configured', async () => {
    const result = smsPlugin({})(baseConfig()) as Config
    const payload = await runOnInit(result)
    expect(payload.logger.warn).toHaveBeenCalled()
  })

  test('disabled:true short-circuits but warns via onInit', async () => {
    const config = baseConfig()
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      disabled: true,
      collections: { logs: true },
    })(config) as Config
    expect((result.collections ?? []).find((c) => c.slug === 'sms-logs')).toBeUndefined()
    const payload = await runOnInit(result)
    expect(payload.logger.warn).toHaveBeenCalled()
  })

  test('passes logsIncludeContext through to sendSMS when collection.logs.includeContext is true', async () => {
    const result = smsPlugin({
      adapter: mockAdapter({ defaultFrom: '+15550000000' }),
      collections: { logs: { includeContext: true } },
    })(baseConfig()) as Config
    const payload = await runOnInit(result)
    await (payload as unknown as {
      sendSMS: (m: { to: string; body: string; context?: Record<string, unknown> }) => Promise<unknown>
    }).sendSMS({
      to: '+15551234567',
      body: 'hi',
      context: { tenantId: 'acme' },
    })
    const call = (payload.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.data.context).toEqual({ tenantId: 'acme' })
  })

  test('propagates errors from adapter.init', async () => {
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    ;(adapter as unknown as { init: () => Promise<void> }).init = async () => {
      throw new Error('init failed')
    }
    const result = smsPlugin({ adapter })(baseConfig()) as Config
    await expect(runOnInit(result)).rejects.toThrow(/init failed/)
  })

  test('calls adapter.init with payload at onInit when defined', async () => {
    const init = vi.fn()
    const adapter = mockAdapter({ defaultFrom: '+15550000000' })
    ;(adapter as unknown as { init: typeof init }).init = init
    const result = smsPlugin({ adapter })(baseConfig()) as Config
    const payload = await runOnInit(result)
    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith(payload)
  })
})
