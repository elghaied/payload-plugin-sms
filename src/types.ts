import type { PayloadRequest } from 'payload'

export type SMSStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown'

export interface SMSMessage {
  to: string
  from?: string
  body: string
  mediaUrls?: string[]
}

export interface SMSCost {
  amount: string
  currency: string
}

export interface SMSResult {
  id: string
  provider: string
  status: SMSStatus
  to: string
  from: string
  body: string
  cost?: SMSCost
  raw: unknown
  sentAt: Date
}

export interface SMSAdapter {
  name: string
  defaultFrom?: string
  send: (message: SMSMessage) => Promise<SMSResult>
}

export interface SMSLogsCollectionOptions {
  slug?: string
  admin?: Record<string, unknown>
}

export interface SMSPluginConfig {
  adapter?: SMSAdapter
  defaultFrom?: string
  disabled?: boolean
  collections?: {
    logs?: boolean | SMSLogsCollectionOptions
  }
  widgets?: boolean
  onSend?: (args: {
    result: SMSResult
    req: PayloadRequest | undefined
  }) => void | Promise<void>
  onError?: (args: {
    error: Error
    message: SMSMessage
    req: PayloadRequest | undefined
  }) => void | Promise<void>
}
