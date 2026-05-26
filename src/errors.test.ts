import { describe, expect, test } from 'vitest'

import { SMSProviderError, SMSValidationError } from './errors.js'

describe('SMSValidationError', () => {
  test('is an Error subclass', () => {
    const err = new SMSValidationError('bad input')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SMSValidationError)
    expect(err.name).toBe('SMSValidationError')
    expect(err.message).toBe('bad input')
  })
})

describe('SMSProviderError', () => {
  test('is an Error subclass', () => {
    const err = new SMSProviderError('provider down')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SMSProviderError)
    expect(err.name).toBe('SMSProviderError')
  })

  test('preserves cause', () => {
    const cause = new Error('underlying')
    const err = new SMSProviderError('wrapped', { cause })
    expect(err.cause).toBe(cause)
  })
})
