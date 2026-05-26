import { describe, expect, test } from 'vitest'

import type { RoutedSMSAdapter, SMSAdapter, SMSWebhookHandler } from '../types.js'

import { assertUniquePaths, collectWebhookHandlers } from './registry.js'

const stubHandler = (path?: string): SMSWebhookHandler => ({
  parse: () => [],
  path,
  verify: () => undefined,
})

const stubAdapter = (name: string, webhook?: SMSWebhookHandler): SMSAdapter => ({
  name,
  send: () => Promise.reject(new Error('not used')),
  webhook,
})

describe('collectWebhookHandlers', () => {
  test('returns [] when adapter is undefined', () => {
    expect(collectWebhookHandlers(undefined)).toEqual([])
  })

  test('returns [] when adapter has no webhook', () => {
    expect(collectWebhookHandlers(stubAdapter('twilio'))).toEqual([])
  })

  test('returns single entry for plain adapter with webhook', () => {
    const h = stubHandler()
    const result = collectWebhookHandlers(stubAdapter('twilio', h))
    expect(result).toEqual([{ adapterName: 'twilio', handler: h }])
  })

  test('returns webhooks array for RoutedSMSAdapter', () => {
    const h1 = stubHandler()
    const h2 = stubHandler()
    const routed: RoutedSMSAdapter = {
      name: 'router',
      send: () => Promise.reject(new Error('not used')),
      webhooks: [
        { adapterName: 'twilio', handler: h1 },
        { adapterName: 'telnyx', handler: h2 },
      ],
    }
    expect(collectWebhookHandlers(routed)).toEqual([
      { adapterName: 'twilio', handler: h1 },
      { adapterName: 'telnyx', handler: h2 },
    ])
  })
})

describe('assertUniquePaths', () => {
  test('passes when all paths unique', () => {
    const handlers = [
      { adapterName: 'twilio', handler: stubHandler() },
      { adapterName: 'telnyx', handler: stubHandler() },
    ]
    expect(() => assertUniquePaths(handlers)).not.toThrow()
  })

  test('passes when explicit path overrides differ', () => {
    const handlers = [
      { adapterName: 'twilio', handler: stubHandler('twilio-marketing') },
      { adapterName: 'twilio', handler: stubHandler('twilio-transactional') },
    ]
    expect(() => assertUniquePaths(handlers)).not.toThrow()
  })

  test('throws when default paths collide', () => {
    const handlers = [
      { adapterName: 'twilio', handler: stubHandler() },
      { adapterName: 'twilio', handler: stubHandler() },
    ]
    expect(() => assertUniquePaths(handlers)).toThrow(/duplicate webhook path/i)
  })

  test('throws when explicit path matches a default', () => {
    const handlers = [
      { adapterName: 'twilio', handler: stubHandler() },
      { adapterName: 'plivo', handler: stubHandler('twilio') },
    ]
    expect(() => assertUniquePaths(handlers)).toThrow(/duplicate webhook path/i)
  })
})
