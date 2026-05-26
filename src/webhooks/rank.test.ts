import { describe, expect, test } from 'vitest'

import { rankStatus, shouldUpdate } from './rank.js'

describe('rankStatus', () => {
  test('orders queued < sent < delivered < failed', () => {
    expect(rankStatus('queued')).toBe(0)
    expect(rankStatus('sent')).toBe(1)
    expect(rankStatus('delivered')).toBe(2)
    expect(rankStatus('failed')).toBe(99)
  })

  test('unknown ranks below queued so it never overwrites', () => {
    expect(rankStatus('unknown')).toBe(-1)
  })
})

describe('shouldUpdate', () => {
  test('returns true when new rank is strictly higher', () => {
    expect(shouldUpdate('queued', 'sent')).toBe(true)
    expect(shouldUpdate('sent', 'delivered')).toBe(true)
    expect(shouldUpdate('queued', 'failed')).toBe(true)
  })

  test('returns false when ranks are equal or lower', () => {
    expect(shouldUpdate('delivered', 'sent')).toBe(false)
    expect(shouldUpdate('delivered', 'delivered')).toBe(false)
    expect(shouldUpdate('sent', 'queued')).toBe(false)
  })

  test('failed is terminal — no further updates land', () => {
    expect(shouldUpdate('failed', 'sent')).toBe(false)
    expect(shouldUpdate('failed', 'delivered')).toBe(false)
    expect(shouldUpdate('failed', 'failed')).toBe(false)
  })

  test('unknown never overwrites anything', () => {
    expect(shouldUpdate('queued', 'unknown')).toBe(false)
    expect(shouldUpdate('sent', 'unknown')).toBe(false)
  })
})
