import type { PayloadRequest } from 'payload'

import { createVerify, X509Certificate } from 'node:crypto'

import type { SMSStatus, SMSStatusEvent, SMSWebhookHandler } from '../../types.js'

import { SMSWebhookVerificationError } from '../../errors.js'

export interface AwsSnsWebhookOptions {
  /** Test seam — defaults to globalThis.fetch. Used for SubscribeURL GET. */
  fetch?: (url: string) => Promise<Response>
  /** Test seam — defaults to fetching SigningCertURL and returning the PEM. */
  fetchCert?: (url: string) => Promise<string>
  region: string
}

const NOTIFICATION_KEYS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
const SUBSCRIPTION_KEYS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
]

const buildCanonical = (body: Record<string, string>, keys: string[]): string => {
  let canonical = ''
  for (const k of keys) {
    if (body[k] === undefined) {continue}
    canonical += `${k}\n${body[k]}\n`
  }
  return canonical
}

const defaultFetchCert = async (url: string): Promise<string> => {
  const r = await fetch(url)
  if (!r.ok) {throw new SMSWebhookVerificationError(`aws-sns: cert fetch ${r.status}`)}
  return r.text()
}

const isAwsSnsCertHost = (url: string, region: string): boolean => {
  try {
    const u = new URL(url)
    return u.hostname === `sns.${region}.amazonaws.com`
  } catch {
    return false
  }
}

const STATUS_MAP: Record<string, SMSStatus> = {
  FAILURE: 'failed',
  SUCCESS: 'delivered',
}

const mapStatus = (s: string | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

export const makeAwsSnsWebhook = (opts: AwsSnsWebhookOptions): SMSWebhookHandler => {
  const fetchCert = opts.fetchCert ?? defaultFetchCert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doFetch = (opts.fetch as any) ?? ((url: string) => fetch(url))

  return {
    parse(_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] {
      const body = JSON.parse(rawBody.toString('utf8')) as Record<string, string>
      if (body.Type !== 'Notification') {return []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let inner: any = {}
      try {
        inner = JSON.parse(body.Message ?? '{}')
      } catch {
        return []
      }
      const id = inner?.notification?.messageId
      if (!id) {return []}
      const event: SMSStatusEvent = {
        occurredAt: new Date(),
        providerMessageId: String(id),
        raw: inner,
        status: mapStatus(inner?.status),
      }
      const providerResponse = inner?.delivery?.providerResponse
      if (providerResponse) {event.errorMessage = String(providerResponse)}
      return [event]
    },

    async verify(req: PayloadRequest, rawBody: Buffer): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messageType = ((req as any).headers as Headers).get('x-amz-sns-message-type')
      if (!messageType) {
        throw new SMSWebhookVerificationError('aws-sns: missing x-amz-sns-message-type header')
      }
      const body = JSON.parse(rawBody.toString('utf8')) as Record<string, string>
      const certUrl = body.SigningCertURL
      if (!certUrl || !isAwsSnsCertHost(certUrl, opts.region)) {
        throw new SMSWebhookVerificationError(
          `aws-sns: SigningCertURL must be hosted at sns.${opts.region}.amazonaws.com`,
        )
      }
      const sigB64 = body.Signature
      if (!sigB64) {
        throw new SMSWebhookVerificationError('aws-sns: missing Signature')
      }
      const certPem = await fetchCert(certUrl)
      const cert = new X509Certificate(certPem)
      const pubKey = cert.publicKey
      const keys = messageType === 'Notification' ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS
      const canonical = buildCanonical(body, keys)
      const v = createVerify('sha1WithRSAEncryption')
      v.update(canonical)
      let ok: boolean
      try {
        ok = v.verify(pubKey, Buffer.from(sigB64, 'base64'))
      } catch {
        throw new SMSWebhookVerificationError('aws-sns: signature verification error')
      }
      if (!ok) {
        throw new SMSWebhookVerificationError('aws-sns: signature mismatch')
      }
      if (messageType === 'SubscriptionConfirmation') {
        if (!body.SubscribeURL) {
          throw new SMSWebhookVerificationError('aws-sns: missing SubscribeURL')
        }
        if (!isAwsSnsCertHost(body.SubscribeURL, opts.region)) {
          throw new SMSWebhookVerificationError(
            `aws-sns: SubscribeURL must be hosted at sns.${opts.region}.amazonaws.com`,
          )
        }
        await doFetch(body.SubscribeURL)
      }
    },
  }
}
