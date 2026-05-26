import { createPrivateKey, createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { PayloadRequest } from 'payload'

import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSWebhookVerificationError } from '../../errors.js'
import { makeAwsSnsWebhook } from './webhook.js'

let certPem: string
let privateKey: ReturnType<typeof createPrivateKey>

beforeAll(() => {
  const certUrl = new URL('./__fixtures__/aws-sns-cert.pem', import.meta.url)
  const keyUrl = new URL('./__fixtures__/aws-sns-key.pem', import.meta.url)
  certPem = readFileSync(certUrl, 'utf8')
  privateKey = createPrivateKey(readFileSync(keyUrl, 'utf8'))
})

const buildCanonicalNotification = (m: Record<string, string>): string => {
  const keys = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
  let canonical = ''
  for (const k of keys) {
    if (m[k] === undefined) continue
    canonical += `${k}\n${m[k]}\n`
  }
  return canonical
}

const buildCanonicalSubscription = (m: Record<string, string>): string => {
  const keys = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  let canonical = ''
  for (const k of keys) {
    if (m[k] === undefined) continue
    canonical += `${k}\n${m[k]}\n`
  }
  return canonical
}

const signCanonical = (canonical: string): string => {
  const signer = createSign('sha1WithRSAEncryption')
  signer.update(canonical)
  return signer.sign(privateKey, 'base64')
}

const makeReq = (
  body: string,
  messageType: 'SubscriptionConfirmation' | 'Notification',
): PayloadRequest => {
  const headers = new Headers()
  headers.set('x-amz-sns-message-type', messageType)
  return {
    headers,
    url: 'https://app.test/api/sms/webhooks/aws-sns',
  } as unknown as PayloadRequest
}

describe('aws-sns webhook', () => {
  let webhook: ReturnType<typeof makeAwsSnsWebhook>
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    webhook = makeAwsSnsWebhook({
      region: 'us-east-1',
      // Test seam: instead of fetching the URL, return our self-signed cert.
      fetchCert: async () => certPem,
      // Side-effect for SubscriptionConfirmation
      fetch: fetchSpy as unknown as (url: string) => Promise<Response>,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('Notification: verify accepts a correctly-signed message', async () => {
    const message = {
      Type: 'Notification',
      MessageId: 'm1',
      TopicArn: 'arn:aws:sns:us-east-1:1:t',
      Message: JSON.stringify({
        notification: { messageId: 'sns-1' },
        delivery: { destination: '+15551234567' },
        status: 'SUCCESS',
      }),
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-x.pem',
    } as Record<string, string>
    const canonical = buildCanonicalNotification(message)
    ;(message as Record<string, string>).Signature = signCanonical(canonical)
    const body = JSON.stringify(message)
    await webhook.verify(makeReq(body, 'Notification'), Buffer.from(body))
  })

  test('Notification: rejects when SigningCertURL host is not AWS', async () => {
    const message = {
      Type: 'Notification',
      MessageId: 'm1',
      TopicArn: 't',
      Message: 'x',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1',
      Signature: 'AAAA',
      SigningCertURL: 'https://evil.example.com/cert.pem',
    } as Record<string, string>
    const body = JSON.stringify(message)
    await expect(
      webhook.verify(makeReq(body, 'Notification'), Buffer.from(body)),
    ).rejects.toBeInstanceOf(SMSWebhookVerificationError)
  })

  test('Notification: rejects bad signature', async () => {
    const message = {
      Type: 'Notification',
      MessageId: 'm1',
      TopicArn: 't',
      Message: 'x',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1',
      Signature: Buffer.from('not a real signature').toString('base64'),
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
    } as Record<string, string>
    const body = JSON.stringify(message)
    await expect(
      webhook.verify(makeReq(body, 'Notification'), Buffer.from(body)),
    ).rejects.toBeInstanceOf(SMSWebhookVerificationError)
  })

  test('SubscriptionConfirmation: verify hits SubscribeURL via fetch', async () => {
    const message = {
      Type: 'SubscriptionConfirmation',
      MessageId: 'm1',
      Token: 'tok',
      TopicArn: 't',
      Message: 'You have to confirm',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
      Timestamp: new Date().toISOString(),
      SignatureVersion: '1',
      SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
    } as Record<string, string>
    const canonical = buildCanonicalSubscription(message)
    ;(message as Record<string, string>).Signature = signCanonical(canonical)
    const body = JSON.stringify(message)
    await webhook.verify(makeReq(body, 'SubscriptionConfirmation'), Buffer.from(body))
    expect(fetchSpy).toHaveBeenCalledWith(message.SubscribeURL)
  })

  test('parse SUCCESS -> delivered', async () => {
    const inner = {
      notification: { messageId: 'sns-1' },
      status: 'SUCCESS',
    }
    const body = JSON.stringify({
      Type: 'Notification',
      Message: JSON.stringify(inner),
    })
    const events = (await webhook.parse(
      makeReq(body, 'Notification'),
      Buffer.from(body),
    )) as Array<{ providerMessageId: string; status: string }>
    expect(events[0].providerMessageId).toBe('sns-1')
    expect(events[0].status).toBe('delivered')
  })

  test('parse FAILURE -> failed', async () => {
    const inner = {
      notification: { messageId: 'sns-2' },
      status: 'FAILURE',
      delivery: { providerResponse: 'phone unreachable' },
    }
    const body = JSON.stringify({
      Type: 'Notification',
      Message: JSON.stringify(inner),
    })
    const events = (await webhook.parse(
      makeReq(body, 'Notification'),
      Buffer.from(body),
    )) as Array<{ providerMessageId: string; status: string; errorMessage?: string }>
    expect(events[0].status).toBe('failed')
    expect(events[0].errorMessage).toBe('phone unreachable')
  })

  test('parse returns [] for SubscriptionConfirmation', async () => {
    const body = JSON.stringify({ Type: 'SubscriptionConfirmation' })
    const events = await webhook.parse(
      makeReq(body, 'SubscriptionConfirmation'),
      Buffer.from(body),
    )
    expect(events).toEqual([])
  })
})
