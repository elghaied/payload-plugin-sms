import type { Payload } from 'payload'

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { mockAdapter } from '../adapters/mock/index.js'
import { SMSProviderError, SMSValidationError } from '../errors.js'
import { routerAdapter } from './index.js'

const stubPayload = (): Payload =>
  ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }) as unknown as Payload

describe('routerAdapter', () => {
  let payload: Payload

  beforeEach(() => {
    payload = stubPayload()
  })

  test('has name "router"', () => {
    const r = routerAdapter({
      providers: { a: mockAdapter({ defaultFrom: '+15550000000' }) },
      route: () => 'a',
    })
    expect(r.name).toBe('router')
  })

  test('exposes defaultFrom from options', () => {
    const r = routerAdapter({
      providers: { a: mockAdapter() },
      route: () => 'a',
      defaultFrom: '+15551111111',
    })
    expect(r.defaultFrom).toBe('+15551111111')
  })

  test('dispatches to the provider returned by route (string result)', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000' })
    const b = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a, b },
      route: () => 'b',
    })
    const result = await r.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
    })
    expect(result.provider).toBe('b')
    expect(b.messages).toHaveLength(1)
    expect(a.messages).toHaveLength(0)
  })

  test('overwrites SMSResult.provider with the map key (not adapter intrinsic name)', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { 'twilio-us': a },
      route: () => 'twilio-us',
    })
    const result = await r.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
    })
    expect(result.provider).toBe('twilio-us')
  })

  test('throws SMSProviderError immediately on unknown provider key (config bug)', async () => {
    const r = routerAdapter({
      providers: { a: mockAdapter({ defaultFrom: '+15550000000' }) },
      route: () => 'nonexistent',
    })
    await expect(
      r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })

  test('does not retry on unknown provider even within an array route', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a },
      route: () => ['nonexistent', 'a'],
    })
    await expect(
      r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
    expect(a.messages).toHaveLength(0)
  })

  test('unknown provider mid-array aborts even after prior SMSProviderError', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000', fail: true })
    const b = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a, b },
      // Route returns: try 'a' (fails), then 'bad-key' (config bug → abort)
      route: () => ['a', 'bad-key', 'b'],
    })
    let caught: unknown
    try {
      await r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(SMSProviderError)
    expect((caught as SMSProviderError).message).toContain('unknown provider "bad-key"')
    // b should NOT have been tried — unknown key short-circuits the failover chain
    expect(b.messages).toHaveLength(0)
  })

  test('tries each provider in array on SMSProviderError, returns first success', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000', fail: true })
    const b = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a, b },
      route: () => ['a', 'b'],
    })
    const result = await r.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
    })
    expect(result.provider).toBe('b')
    expect(b.messages).toHaveLength(1)
  })

  test('throws aggregated SMSProviderError when all providers fail', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000', fail: true })
    const b = mockAdapter({ defaultFrom: '+15550000000', fail: true })
    const r = routerAdapter({
      providers: { a, b },
      route: () => ['a', 'b'],
    })
    let caught: unknown
    try {
      await r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(SMSProviderError)
    expect((caught as SMSProviderError).message).toContain('router: all providers failed')
    expect(Array.isArray((caught as SMSProviderError).cause)).toBe(true)
  })

  test('does not retry on SMSValidationError thrown by an adapter', async () => {
    const a = {
      name: 'a',
      defaultFrom: '+15550000000',
      async send() {
        throw new SMSValidationError('bad shape')
      },
    }
    const b = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a, b },
      route: () => ['a', 'b'],
    })
    await expect(
      r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' }),
    ).rejects.toBeInstanceOf(SMSValidationError)
    expect(b.messages).toHaveLength(0)
  })

  test('passes message context through to the chosen adapter', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000' })
    const r = routerAdapter({
      providers: { a },
      route: ({ message }) => {
        expect(message.context).toEqual({ tenantId: 'acme' })
        return 'a'
      },
    })
    await r.send({
      to: '+15551234567',
      from: '+15550000000',
      body: 'hi',
      context: { tenantId: 'acme' },
    })
    expect(a.messages[0].context).toEqual({ tenantId: 'acme' })
  })

  test('init captures payload and exposes it to route via RouteArgs', async () => {
    const a = mockAdapter({ defaultFrom: '+15550000000' })
    const seen: Payload[] = []
    const r = routerAdapter({
      providers: { a },
      route: ({ payload: p }) => {
        seen.push(p)
        return 'a'
      },
    })
    expect(r.init).toBeDefined()
    await r.init!(payload)
    await r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(payload)
  })

  test('init also forwards to child adapters that define init', async () => {
    const childInit = vi.fn()
    const child = {
      name: 'child',
      defaultFrom: '+15550000000',
      send: async () => ({
        id: 'x', provider: 'child', status: 'sent' as const,
        to: '+15551234567', from: '+15550000000', body: 'hi',
        raw: {}, sentAt: new Date(),
      }),
      init: childInit,
    }
    const r = routerAdapter({ providers: { child }, route: () => 'child' })
    await r.init!(payload)
    expect(childInit).toHaveBeenCalledWith(payload)
  })

  test('send before init throws a clear error when route needs payload', async () => {
    const r = routerAdapter({
      providers: { a: mockAdapter({ defaultFrom: '+15550000000' }) },
      route: ({ payload: p }) => {
        if (!p) throw new Error('payload not set')
        return 'a'
      },
    })
    await expect(
      r.send({ to: '+15551234567', from: '+15550000000', body: 'hi' }),
    ).rejects.toThrow(/payload not set/)
  })
})
