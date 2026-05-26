import type { Payload } from 'payload'

import type { OutboundSMSMessage, SMSAdapter } from '../types.js'

export type ProviderName = string

export interface RouteArgs {
  message: OutboundSMSMessage
  providers: Readonly<Record<ProviderName, SMSAdapter>>
  payload: Payload
}

export type RouteResult = ProviderName | ProviderName[]

export type RouteFunction =
  (args: RouteArgs) => RouteResult | Promise<RouteResult>

export interface RouterAdapterOptions {
  providers: Record<ProviderName, SMSAdapter>
  route: RouteFunction
  defaultFrom?: string
}
