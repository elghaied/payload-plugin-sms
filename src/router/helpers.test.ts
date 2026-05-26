import type { Payload } from 'payload'

import { describe, expect, test, vi } from 'vitest'

import { mockAdapter } from '../adapters/mock/index.js'
import { SMSProviderError } from '../errors.js'
import { byCountryPrefix, byTenantLookup } from './helpers.js'
import type { RouteArgs } from './types.js'

const stubPayload = (
  findByIDImpl: (args: { collection: string; id: string }) => Promise<unknown>,
): Payload =>
  ({
    findByID: vi.fn(findByIDImpl),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }) as unknown as Payload

const buildArgs = (
  payload: Payload,
  context?: Record<string, unknown>,
): RouteArgs => ({
  message: {
    to: '+15551234567',
    from: '+15550000000',
    body: 'hi',
    context,
  },
  providers: { twilio: mockAdapter(), telnyx: mockAdapter() },
  payload,
})

describe('byTenantLookup', () => {
  test('reads tenantId from context and returns providerField from tenant doc', async () => {
    const payload = stubPayload(async () => ({ id: 't1', smsProvider: 'twilio' }))
    const route = byTenantLookup({ collection: 'tenants', providerField: 'smsProvider' })
    const r = await route(buildArgs(payload, { tenantId: 't1' }))
    expect(r).toBe('twilio')
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tenants', id: 't1', depth: 0 }),
    )
  })

  test('honors contextKey override', async () => {
    const payload = stubPayload(async () => ({ smsProvider: 'telnyx' }))
    const route = byTenantLookup({
      collection: 'tenants',
      contextKey: 'orgId',
      providerField: 'smsProvider',
    })
    const r = await route(buildArgs(payload, { orgId: 'org-42' }))
    expect(r).toBe('telnyx')
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'org-42' }),
    )
  })

  test('uses fallback when context key is missing', async () => {
    const payload = stubPayload(async () => null)
    const route = byTenantLookup({
      collection: 'tenants',
      providerField: 'smsProvider',
      fallback: 'twilio',
    })
    const r = await route(buildArgs(payload, {}))
    expect(r).toBe('twilio')
    expect(payload.findByID).not.toHaveBeenCalled()
  })

  test('throws SMSProviderError when context key missing and no fallback', async () => {
    const payload = stubPayload(async () => null)
    const route = byTenantLookup({ collection: 'tenants', providerField: 'smsProvider' })
    await expect(route(buildArgs(payload, {}))).rejects.toBeInstanceOf(SMSProviderError)
  })

  test('caches lookups within cacheMs window', async () => {
    const findByID = vi.fn(async () => ({ smsProvider: 'twilio' }))
    const payload = { findByID } as unknown as Payload
    const route = byTenantLookup({
      collection: 'tenants',
      providerField: 'smsProvider',
      cacheMs: 10_000,
    })
    await route(buildArgs(payload, { tenantId: 't1' }))
    await route(buildArgs(payload, { tenantId: 't1' }))
    await route(buildArgs(payload, { tenantId: 't1' }))
    expect(findByID).toHaveBeenCalledTimes(1)
  })

  test('uses fallback when tenant doc lookup throws', async () => {
    const payload = stubPayload(async () => {
      throw new Error('not found')
    })
    const route = byTenantLookup({
      collection: 'tenants',
      providerField: 'smsProvider',
      fallback: 'telnyx',
    })
    const r = await route(buildArgs(payload, { tenantId: 'missing' }))
    expect(r).toBe('telnyx')
  })

  test('throws SMSProviderError when tenant lookup throws and no fallback', async () => {
    const payload = stubPayload(async () => {
      throw new Error('not found')
    })
    const route = byTenantLookup({ collection: 'tenants', providerField: 'smsProvider' })
    await expect(
      route(buildArgs(payload, { tenantId: 'missing' })),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})

const argsWithTo = (to: string): RouteArgs => ({
  message: { to, from: '+15550000000', body: 'hi' },
  providers: { twilio: mockAdapter(), telnyx: mockAdapter() },
  payload: {} as Payload,
})

describe('byCountryPrefix', () => {
  test('matches a single prefix', async () => {
    const route = byCountryPrefix({ '+1': 'twilio', '+33': 'telnyx' })
    expect(await route(argsWithTo('+15551234567'))).toBe('twilio')
    expect(await route(argsWithTo('+33123456789'))).toBe('telnyx')
  })

  test('longest-prefix match wins', async () => {
    const route = byCountryPrefix({ '+1': 'twilio', '+1242': 'telnyx' })
    expect(await route(argsWithTo('+12025550100'))).toBe('twilio')
    expect(await route(argsWithTo('+12421234567'))).toBe('telnyx')
  })

  test('uses fallback when no prefix matches', async () => {
    const route = byCountryPrefix({ '+33': 'telnyx' }, { fallback: 'twilio' })
    expect(await route(argsWithTo('+15551234567'))).toBe('twilio')
  })

  test('throws SMSProviderError when no match and no fallback', async () => {
    const route = byCountryPrefix({ '+33': 'telnyx' })
    await expect(route(argsWithTo('+15551234567'))).rejects.toBeInstanceOf(SMSProviderError)
  })
})
