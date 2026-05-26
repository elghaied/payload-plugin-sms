import type { Payload } from 'payload'

import { describe, expect, test } from 'vitest'

import { mockAdapter } from '../adapters/mock/index.js'
import { routerAdapter } from './index.js'
import { withFailover } from './failover.js'
import type { RouteArgs, RouteFunction } from './types.js'

const makeArgs = (): RouteArgs => ({
  message: { to: '+15551234567', from: '+15550000000', body: 'hi' },
  providers: { a: mockAdapter(), b: mockAdapter(), c: mockAdapter() },
  payload: {} as Payload,
})

describe('withFailover', () => {
  test('appends fallback list to a single-key inner result, primary first', async () => {
    const inner: RouteFunction = async () => 'a'
    const route = withFailover(inner, ['b', 'c'])
    const r = await route(makeArgs())
    expect(r).toEqual(['a', 'b', 'c'])
  })

  test('dedupes the primary out of the fallback list', async () => {
    const inner: RouteFunction = async () => 'b'
    const route = withFailover(inner, ['a', 'b', 'c'])
    const r = await route(makeArgs())
    expect(r).toEqual(['b', 'a', 'c'])
  })

  test('passes through unchanged when inner already returns an array', async () => {
    const inner: RouteFunction = async () => ['x', 'y']
    const route = withFailover(inner, ['a', 'b'])
    const r = await route(makeArgs())
    expect(r).toEqual(['x', 'y'])
  })
})

describe('withFailover preserves routerAdapter.webhooks', () => {
  test('webhooks survive when withFailover wraps the route fn', () => {
    const r = routerAdapter({
      providers: { m: mockAdapter() },
      route: withFailover(() => 'm', []),
    }) as { webhooks: Array<{ adapterName: string; handler: unknown }> }
    expect(r.webhooks).toHaveLength(1)
    expect(r.webhooks[0].adapterName).toBe('m')
  })
})
