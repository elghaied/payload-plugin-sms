import type { Payload } from 'payload'

import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'
import { SMSValidationError } from 'payload-plugin-sms'
import { routerAdapter, byTenantLookup } from 'payload-plugin-sms/router'
import { mockAdapter } from 'payload-plugin-sms/mock'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { testSmsEndpoint } from './endpoints/testSms.js'
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

describe('dev test-sms endpoint', () => {
  test('returns 400 when ?to is missing', async () => {
    const request = new Request('http://localhost:3000/api/test-sms')
    const payloadRequest = await createPayloadRequest({ config, request })
    if (typeof testSmsEndpoint.handler !== 'function') throw new Error('no handler')
    const response = await testSmsEndpoint.handler(payloadRequest)
    expect(response.status).toBe(400)
  })

  test('sends SMS when ?to is provided', async () => {
    const request = new Request('http://localhost:3000/api/test-sms?to=%2B15551234567&body=hey')
    const payloadRequest = await createPayloadRequest({ config, request })
    if (typeof testSmsEndpoint.handler !== 'function') throw new Error('no handler')
    const response = await testSmsEndpoint.handler(payloadRequest)
    expect(response.status).toBe(200)
    const data = (await response.json()) as { ok: boolean; result: { provider: string } }
    expect(data.ok).toBe(true)
    expect(data.result.provider).toBe('mock')
  })
})

describe('routerAdapter integration', () => {
  test('routes by tenant lookup end-to-end through the router', async () => {
    const acme = await payload.create({
      collection: 'tenants',
      data: { name: 'Acme', smsProvider: 'twilio' },
    })
    const globex = await payload.create({
      collection: 'tenants',
      data: { name: 'Globex', smsProvider: 'telnyx' },
    })

    const tw = mockAdapter({ defaultFrom: '+15550000001' })
    const tx = mockAdapter({ defaultFrom: '+15550000002' })
    const router = routerAdapter({
      providers: { twilio: tw, telnyx: tx },
      route: byTenantLookup({
        collection: 'tenants',
        providerField: 'smsProvider',
      }),
    })

    // Plugin's onInit would call router.init in production; we do it explicitly
    // here since this test doesn't wire through a fresh plugin instance.
    await router.init!(payload)

    const acmeResult = await router.send({
      to: '+15551234567',
      from: '+15550000001',
      body: 'hi',
      context: { tenantId: acme.id },
    })
    expect(acmeResult.provider).toBe('twilio')
    expect(tw.messages).toHaveLength(1)

    const globexResult = await router.send({
      to: '+15551234567',
      from: '+15550000002',
      body: 'hi',
      context: { tenantId: globex.id },
    })
    expect(globexResult.provider).toBe('telnyx')
    expect(tx.messages).toHaveLength(1)
  })
})
