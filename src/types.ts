import type { Payload, PayloadRequest } from 'payload'

export type SMSStatus = 'delivered' | 'failed' | 'queued' | 'sent' | 'unknown'

export interface SMSMessage {
  body: string
  context?: Record<string, unknown>
  from?: string
  mediaUrls?: string[]
  to: string
}

/** Internal — passed to adapter.send after `from` is resolved by sendSMS. */
export interface OutboundSMSMessage extends Omit<SMSMessage, 'from'> {
  from: string
  /** Resolved per-message delivery-status callback URL (set by the plugin when webhooks are enabled). */
  statusCallbackUrl?: string
}

export interface SMSCost {
  amount: string
  currency: string
}

export interface SMSResult {
  body: string
  context?: Record<string, unknown>
  cost?: SMSCost
  from: string
  id: string
  provider: string
  raw: unknown
  sentAt: Date
  status: SMSStatus
  to: string
}

/** Status event parsed from a provider webhook. */
export interface SMSStatusEvent {
  cost?: SMSCost
  errorCode?: string
  errorMessage?: string
  occurredAt: Date
  providerMessageId: string
  raw: unknown
  status: SMSStatus
}

export interface SMSWebhookHandler {
  /** Parse one or more status events from the raw body. */
  parse: (req: PayloadRequest, rawBody: Buffer) => Promise<SMSStatusEvent[]> | SMSStatusEvent[]
  /** URL path segment under basePath. Defaults to adapter.name. */
  path?: string
  /** Verify signature against raw body + headers. Throws SMSWebhookVerificationError on failure. */
  verify: (req: PayloadRequest, rawBody: Buffer) => Promise<void> | void
}

export interface SMSAdapter {
  defaultFrom?: string
  init?: (payload: Payload) => Promise<void> | void
  name: string
  send: (message: OutboundSMSMessage) => Promise<SMSResult>
  webhook?: SMSWebhookHandler
}

/** routerAdapter exposes this — multiple webhooks from its child adapters. */
export interface RoutedSMSAdapter extends SMSAdapter {
  webhooks: Array<{ adapterName: string; handler: SMSWebhookHandler }>
}

export interface SMSLogsCollectionOptions {
  admin?: Record<string, unknown>
  includeContext?: boolean
  slug?: string
  statusHistory?: boolean
}

export interface SMSWebhooksConfig {
  basePath?: string
  enabled: boolean
  /** Override the auto-derived delivery-status callback URL (else derived from config.serverURL + basePath). */
  statusCallbackUrl?: string
  trustProxy?: boolean
  verifySignature?: boolean
}

export interface SMSPluginConfig {
  adapter?: SMSAdapter
  collections?: {
    logs?: boolean | SMSLogsCollectionOptions
  }
  defaultFrom?: string
  disabled?: boolean
  onError?: (args: {
    error: Error
    message: SMSMessage
    req: PayloadRequest | undefined
  }) => Promise<void> | void
  onSend?: (args: {
    req: PayloadRequest | undefined
    result: SMSResult
  }) => Promise<void> | void
  onStatus?: (args: {
    event: SMSStatusEvent
    log: null | Record<string, unknown>
    req: PayloadRequest
  }) => Promise<void> | void
  /**
   * Opt-in: scope the dashboard widget to the host's selected tenant. When set AND the
   * logs collection carries `field`, the widget filters by the tenant id read from `cookie`
   * and runs with `overrideAccess: false` so the host's read access control is honored.
   * Omit entirely to leave the widget unchanged (single-tenant default).
   */
  tenantScoping?: {
    /** Cookie holding the selected tenant id. Default: 'payload-tenant'. */
    cookie?: string
    /** Field on the logs collection that holds the tenant. Default: 'tenant'. */
    field?: string
  }
  webhooks?: SMSWebhooksConfig
  widgets?: boolean
}
