import type { OutboundSMSMessage, SMSAdapter, SMSMessage, SMSResult, SMSStatus } from '../../types.js'

import { SMSProviderError } from '../../errors.js'

export interface MockAdapterOptions {
  defaultFrom?: string
  fail?: boolean
  status?: SMSStatus
}

export interface MockAdapter extends SMSAdapter {
  messages: Array<SMSMessage & { sentAt: Date }>
  reset: () => void
}

export const mockAdapter = (opts: MockAdapterOptions = {}): MockAdapter => {
  const messages: Array<SMSMessage & { sentAt: Date }> = []

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
        provider: 'mock',
        status: opts.status ?? 'sent',
        to: message.to,
        from: message.from,
        body: message.body,
        raw: { ...message },
        sentAt,
      }
    },
  }
}
