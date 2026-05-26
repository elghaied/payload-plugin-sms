import type { Payload } from 'payload'

import type { SMSAdapter, OutboundSMSMessage, SMSResult } from '../types.js'

import { SMSProviderError, SMSValidationError } from '../errors.js'

import type { RouteArgs, RouteResult, RouterAdapterOptions } from './types.js'

export const routerAdapter = (opts: RouterAdapterOptions): SMSAdapter => {
  const providers = Object.freeze({ ...opts.providers })
  let payloadRef: Payload | undefined

  return {
    name: 'router',
    defaultFrom: opts.defaultFrom,
    async init(payload: Payload): Promise<void> {
      payloadRef = payload
      for (const adapter of Object.values(providers)) {
        if (adapter.init) await adapter.init(payload)
      }
    },
    async send(message: OutboundSMSMessage): Promise<SMSResult> {
      const args: RouteArgs = {
        message,
        providers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: payloadRef as any,
      }

      const raw: RouteResult = await opts.route(args)
      const keys = Array.isArray(raw) ? raw : [raw]
      if (keys.length === 0) {
        throw new SMSProviderError('router: route returned an empty list')
      }

      const errors: Error[] = []
      for (const key of keys) {
        const adapter = providers[key]
        if (!adapter) {
          throw new SMSProviderError(`router: unknown provider "${key}"`)
        }
        try {
          const result = await adapter.send(message)
          return { ...result, provider: key }
        } catch (err) {
          if (err instanceof SMSValidationError) {
            throw err
          }
          if (err instanceof SMSProviderError) {
            errors.push(err)
            continue
          }
          throw err
        }
      }

      throw new SMSProviderError(
        `router: all providers failed (${keys.join(', ')})`,
        { cause: errors as unknown },
      )
    },
  }
}

export { byTenantLookup, byCountryPrefix, byRoundRobin, byRandom } from './helpers.js'
export { withFailover } from './failover.js'
export type {
  ProviderName,
  RouteArgs,
  RouteFunction,
  RouteResult,
  RouterAdapterOptions,
} from './types.js'
export type { ByTenantLookupOptions, ByCountryPrefixOptions } from './helpers.js'
