import type { Payload, PayloadRequest } from 'payload'

export type SMSStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown'

export interface SMSMessage {
  to: string
  from?: string
  body: string
  mediaUrls?: string[]
  context?: Record<string, unknown>
}

/** Internal — passed to adapter.send after `from` is resolved by sendSMS. */
export interface OutboundSMSMessage extends Omit<SMSMessage, 'from'> {
  from: string
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
  context?: Record<string, unknown>
  sentAt: Date
}

/** Status event parsed from a provider webhook. */
export interface SMSStatusEvent {
  providerMessageId: string
  status: SMSStatus
  errorCode?: string
  errorMessage?: string
  cost?: SMSCost
  occurredAt: Date
  raw: unknown
}

export interface SMSWebhookHandler {
  /** URL path segment under basePath. Defaults to adapter.name. */
  path?: string
  /** Verify signature against raw body + headers. Throws SMSWebhookVerificationError on failure. */
  verify: (req: PayloadRequest, rawBody: Buffer) => Promise<void> | void
  /** Parse one or more status events from the raw body. */
  parse: (req: PayloadRequest, rawBody: Buffer) => Promise<SMSStatusEvent[]> | SMSStatusEvent[]
}

export interface SMSAdapter {
  name: string
  defaultFrom?: string
  send: (message: OutboundSMSMessage) => Promise<SMSResult>
  init?: (payload: Payload) => void | Promise<void>
  webhook?: SMSWebhookHandler
}

/** routerAdapter exposes this — multiple webhooks from its child adapters. */
export interface RoutedSMSAdapter extends SMSAdapter {
  webhooks: Array<{ adapterName: string; handler: SMSWebhookHandler }>
}

export interface SMSLogsCollectionOptions {
  slug?: string
  admin?: Record<string, unknown>
  includeContext?: boolean
  statusHistory?: boolean
}

export interface SMSWebhooksConfig {
  enabled: boolean
  basePath?: string
  trustProxy?: boolean
  verifySignature?: boolean
}

export interface SMSPluginConfig {
  adapter?: SMSAdapter
  defaultFrom?: string
  disabled?: boolean
  collections?: {
    logs?: boolean | SMSLogsCollectionOptions
  }
  widgets?: boolean
  webhooks?: SMSWebhooksConfig
  onSend?: (args: {
    result: SMSResult
    req: PayloadRequest | undefined
  }) => void | Promise<void>
  onError?: (args: {
    error: Error
    message: SMSMessage
    req: PayloadRequest | undefined
  }) => void | Promise<void>
  onStatus?: (args: {
    event: SMSStatusEvent
    log: Record<string, unknown> | null
    req: PayloadRequest
  }) => void | Promise<void>
}
