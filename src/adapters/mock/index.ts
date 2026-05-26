import type { PayloadRequest } from 'payload'

import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSMessage,
  SMSResult,
  SMSStatus,
  SMSStatusEvent,
  SMSWebhookHandler,
} from '../../types.js'

import { SMSProviderError, SMSWebhookVerificationError } from '../../errors.js'

export interface MockAdapterOptions {
  defaultFrom?: string
  fail?: boolean
  status?: SMSStatus
}

export interface MockAdapter extends SMSAdapter {
  messages: Array<{ sentAt: Date } & SMSMessage>
  reset: () => void
  webhook: SMSWebhookHandler
}

const mockWebhook: SMSWebhookHandler = {
  parse: (_req: PayloadRequest, rawBody: Buffer): SMSStatusEvent[] => {
    if (rawBody.length === 0) {return []}
    const data = JSON.parse(rawBody.toString('utf8')) as {
      errorCode?: string
      errorMessage?: string
      providerMessageId: string
      status: SMSStatus
    }
    return [
      {
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        occurredAt: new Date(),
        providerMessageId: data.providerMessageId,
        raw: data,
        status: data.status,
      },
    ]
  },
  verify: async (req: PayloadRequest, _rawBody: Buffer): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = ((req as any).headers as Headers).get('x-mock-signature')
    if (sig !== 'ok') {
      throw new SMSWebhookVerificationError('mock: bad signature')
    }
  },
}

export const mockAdapter = (opts: MockAdapterOptions = {}): MockAdapter => {
  const messages: Array<{ sentAt: Date } & SMSMessage> = []

  return {
    name: 'mock',
    defaultFrom: opts.defaultFrom,
    messages,
    reset() {
      messages.length = 0
    },
    async send(message: OutboundSMSMessage): Promise<SMSResult> {
      if (opts.fail) {
        throw new SMSProviderError('mock failure')
      }
      const sentAt = new Date()
      messages.push({ ...message, sentAt })
      return {
        id: `mock-${messages.length}`,
        body: message.body,
        from: message.from,
        provider: 'mock',
        raw: { ...message },
        sentAt,
        status: opts.status ?? 'sent',
        to: message.to,
      }
    },
    webhook: mockWebhook,
  }
}
