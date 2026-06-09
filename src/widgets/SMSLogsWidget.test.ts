import type { Payload } from 'payload'

import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSLogsWidget } from './SMSLogsWidget.js'

type MockPayload = {
  count: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
} & Payload

const makePayload = (opts: { hasTenantField?: boolean } = {}): MockPayload => {
  const fields = [
    { name: 'to', type: 'text' },
    { name: 'sentAt', type: 'date' },
  ]
  if (opts.hasTenantField) {
    fields.push({ name: 'tenant', type: 'relationship' } as never)
  }
  return {
    collections: {
      'sms-logs': { config: { fields } },
    },
    count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
    find: vi.fn().mockResolvedValue({ docs: [] }),
  } as unknown as MockPayload
}

const makeProps = (payload: MockPayload, cookie?: string, tenantScoping?: unknown) =>
  ({
    req: {
      headers: new Headers(cookie ? { cookie } : {}),
      i18n: { t: (k: string) => k },
      payload,
      user: { id: 'admin-1' },
    },
    tenantScoping,
  }) as never

describe('SMSLogsWidget tenant scoping', () => {
  let payload: MockPayload

  beforeEach(() => {
    payload = makePayload({ hasTenantField: true })
  })

  test('scopes count and find to the selected tenant when enabled and a tenant is selected', async () => {
    await SMSLogsWidget(
      makeProps(payload, 'payload-tenant=tenant-1', { cookie: 'payload-tenant', field: 'tenant' }),
    )

    const countArg = payload.count.mock.calls[0][0]
    expect(countArg.overrideAccess).toBe(false)
    expect(countArg.where.tenant).toEqual({ equals: 'tenant-1' })
    expect(countArg.where.sentAt).toBeDefined()

    const findArg = payload.find.mock.calls[0][0]
    expect(findArg.overrideAccess).toBe(false)
    expect(findArg.where.tenant).toEqual({ equals: 'tenant-1' })
  })

  test('does not filter by tenant but still respects access (all tenants) when no tenant is selected', async () => {
    await SMSLogsWidget(
      makeProps(payload, undefined, { cookie: 'payload-tenant', field: 'tenant' }),
    )

    const countArg = payload.count.mock.calls[0][0]
    expect(countArg.overrideAccess).toBe(false)
    expect(countArg.where.tenant).toBeUndefined()

    const findArg = payload.find.mock.calls[0][0]
    expect(findArg.overrideAccess).toBe(false)
    expect(findArg.where?.tenant).toBeUndefined()
  })

  test('behaves exactly as before when tenant scoping is not configured', async () => {
    await SMSLogsWidget(makeProps(payload, 'payload-tenant=tenant-1', undefined))

    const countArg = payload.count.mock.calls[0][0]
    expect(countArg.overrideAccess).toBeUndefined()
    expect(countArg.where.tenant).toBeUndefined()

    const findArg = payload.find.mock.calls[0][0]
    expect(findArg.overrideAccess).toBeUndefined()
    expect(findArg.where).toBeUndefined()
  })

  test('behaves as before when enabled but the logs collection has no tenant field', async () => {
    payload = makePayload({ hasTenantField: false })
    await SMSLogsWidget(
      makeProps(payload, 'payload-tenant=tenant-1', { cookie: 'payload-tenant', field: 'tenant' }),
    )

    const countArg = payload.count.mock.calls[0][0]
    expect(countArg.overrideAccess).toBeUndefined()
    expect(countArg.where.tenant).toBeUndefined()
  })
})
