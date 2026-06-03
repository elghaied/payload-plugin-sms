import { describe, expect, it } from 'vitest'
import { translations } from './index.js'
import { en } from './en.js'
import { fr } from './fr.js'

describe('sms translations', () => {
  it('registers en + fr under the `sms` namespace', () => {
    expect(translations.en.sms).toBe(en)
    expect(translations.fr.sms).toBe(fr)
  })
  it('en and fr have identical key sets', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })
  it('covers the status + widget keys', () => {
    for (const k of ['statusDelivered', 'statusFailed', 'fieldTo', 'widgetEmpty', 'collectionLabelPlural']) {
      expect(en).toHaveProperty(k); expect(fr).toHaveProperty(k)
    }
  })
})
