import { describe, expect, test } from 'vitest'

import { buildSMSLogsCollection } from './SMSLogs.js'

describe('buildSMSLogsCollection', () => {
  test('uses default slug "sms-logs"', () => {
    const c = buildSMSLogsCollection(true)
    expect(c.slug).toBe('sms-logs')
  })

  test('honors slug override', () => {
    const c = buildSMSLogsCollection({ slug: 'audit-sms' })
    expect(c.slug).toBe('audit-sms')
  })

  test('sets admin.group to "SMS" by default', () => {
    const c = buildSMSLogsCollection(true)
    expect(c.admin?.group).toBe('SMS')
    expect(c.admin?.useAsTitle).toBe('to')
  })

  test('merges admin overrides', () => {
    const c = buildSMSLogsCollection({ admin: { group: 'Messaging' } })
    expect(c.admin?.group).toBe('Messaging')
    expect(c.admin?.useAsTitle).toBe('to')
  })

  test('blocks create/update/delete from admin', () => {
    const c = buildSMSLogsCollection(true)
    expect((c.access?.create as () => boolean)()).toBe(false)
    expect((c.access?.update as () => boolean)()).toBe(false)
    expect((c.access?.delete as () => boolean)()).toBe(false)
  })

  test('read access requires user', () => {
    const c = buildSMSLogsCollection(true)
    const read = c.access?.read as (args: { req: { user: unknown } }) => boolean
    expect(read({ req: { user: null } })).toBe(false)
    expect(read({ req: { user: { id: '1' } } })).toBe(true)
  })

  test('declares all required fields', () => {
    const c = buildSMSLogsCollection(true)
    const fieldNames = c.fields.map((f) => 'name' in f ? f.name : '').sort()
    expect(fieldNames).toEqual(
      ['body', 'cost', 'error', 'from', 'provider', 'providerMessageId', 'sentAt', 'status', 'to'].sort(),
    )
  })
})
