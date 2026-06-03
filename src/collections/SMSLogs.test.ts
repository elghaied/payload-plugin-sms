import { describe, expect, it, test } from 'vitest'

import { en } from '../translations/en.js'
import { fr } from '../translations/fr.js'
import { buildSMSLogsCollection } from './SMSLogs.js'

const fakeT = (table: Record<string, string>) => (key: string) =>
  table[key.replace(/^sms:/, '')] ?? key

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
      ['body', 'cost', 'deliveredAt', 'error', 'errorCode', 'failedAt', 'from', 'provider', 'providerMessageId', 'sentAt', 'status', 'to'].sort(),
    )
  })

  test('does not include context field by default', () => {
    const c = buildSMSLogsCollection(true)
    const names = c.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).not.toContain('context')
  })

  test('includes context (json) field when includeContext is true', () => {
    const c = buildSMSLogsCollection({ includeContext: true })
    const field = c.fields.find((f) => 'name' in f && f.name === 'context')
    expect(field).toBeDefined()
    expect(field && 'type' in field && field.type).toBe('json')
  })
})

describe('SMSLogs schema additions for webhooks', () => {
  test('declares deliveredAt, failedAt, errorCode by default', () => {
    const c = buildSMSLogsCollection(true)
    const names = c.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).toContain('deliveredAt')
    expect(names).toContain('failedAt')
    expect(names).toContain('errorCode')
  })

  test('does not add statusHistory by default', () => {
    const c = buildSMSLogsCollection(true)
    const names = c.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).not.toContain('statusHistory')
  })

  test('adds statusHistory when opted in', () => {
    const c = buildSMSLogsCollection({ statusHistory: true })
    const names = c.fields.map((f) => ('name' in f ? f.name : ''))
    expect(names).toContain('statusHistory')
    const history = c.fields.find(
      (f) => 'name' in f && f.name === 'statusHistory',
    ) as { fields: Array<{ name: string }>; type: string }
    expect(history.type).toBe('array')
    expect(history.fields.map((f) => f.name).sort()).toEqual(
      ['errorCode', 'occurredAt', 'status'].sort(),
    )
  })
})

describe('SMSLogs i18n labels', () => {
  it('field + option + collection labels resolve via the sms namespace', () => {
    const col = buildSMSLogsCollection({ statusHistory: true })
    const fields = col.fields as any[]
    const toField = fields.find((f) => f.name === 'to')
    expect((toField.label as any)({ t: fakeT(en) })).toBe('To')
    expect((toField.label as any)({ t: fakeT(fr) })).toBe('Destinataire')
    const statusField = fields.find((f) => f.name === 'status')
    const delivered = statusField.options.find((o: any) => o.value === 'delivered')
    expect((delivered.label as any)({ t: fakeT(fr) })).toBe('Livré')
    expect(((col.labels as any).plural)({ t: fakeT(fr) })).toBe('Journaux SMS')
  })
})
