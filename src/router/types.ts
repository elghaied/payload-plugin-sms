import type { Payload } from 'payload'

import type { OutboundSMSMessage, SMSAdapter } from '../types.js'

export type ProviderName = string

export interface RouteArgs {
  message: OutboundSMSMessage
  payload: Payload
  providers: Readonly<Record<ProviderName, SMSAdapter>>
}

export type RouteResult = ProviderName | ProviderName[]

export type RouteFunction =
  (args: RouteArgs) => Promise<RouteResult> | RouteResult

export interface RouterAdapterOptions {
  defaultFrom?: string
  providers: Record<ProviderName, SMSAdapter>
  route: RouteFunction
}
