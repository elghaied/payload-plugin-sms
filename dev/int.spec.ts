import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { SMSValidationError } from 'payload-plugin-sms'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { devSMSAdapter } from './payload.config.js'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.destroy()
})

beforeEach(() => {
  devSMSAdapter.reset()
})

describe('payload-plugin-sms integration', () => {
  test('payload.sendSMS is registered', () => {
    expect(typeof payload.sendSMS).toBe('function')
  })

  test('sms-logs collection is registered', () => {
    expect(payload.collections['sms-logs']).toBeDefined()
  })

  test('rejects non-E.164 `to`', async () => {
    await expect(
      payload.sendSMS({ to: '5551234567', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSValidationError)
  })

  test('sends through adapter and creates a log row', async () => {
    const result = await payload.sendSMS({
      to: '+15551234567',
      body: 'hello from int test',
    })
    expect(result.provider).toBe('mock')
    expect(result.status).toBe('sent')
    expect(devSMSAdapter.messages).toHaveLength(1)

    const { docs } = await payload.find({
      collection: 'sms-logs',
      where: { providerMessageId: { equals: result.id } },
    })
    expect(docs).toHaveLength(1)
    expect(docs[0].to).toBe('+15551234567')
    expect(docs[0].provider).toBe('mock')
    expect(docs[0].status).toBe('sent')
  })
})
