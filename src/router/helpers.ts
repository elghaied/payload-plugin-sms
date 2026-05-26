import type { ProviderName, RouteFunction } from './types.js'

import { SMSProviderError } from '../errors.js'

export interface ByTenantLookupOptions {
  cacheMs?: number
  collection: string
  contextKey?: string
  fallback?: ProviderName
  providerField: string
}

interface CacheEntry {
  at: number
  name: ProviderName
}

export const byTenantLookup = (opts: ByTenantLookupOptions): RouteFunction => {
  const contextKey = opts.contextKey ?? 'tenantId'
  const cache = opts.cacheMs ? new Map<string, CacheEntry>() : undefined

  return async ({ message, payload }) => {
    const rawId = message.context?.[contextKey]
    if (typeof rawId !== 'string' || rawId.length === 0) {
      if (opts.fallback) {return opts.fallback}
      throw new SMSProviderError(
        `byTenantLookup: message.context.${contextKey} is required (got ${JSON.stringify(rawId)})`,
      )
    }
    const id = rawId

    if (cache) {
      const hit = cache.get(id)
      if (hit && Date.now() - hit.at < opts.cacheMs!) {
        return hit.name
      }
    }

    let doc: null | Record<string, unknown>
    try {
      doc = (await payload.findByID({
        id,
        collection: opts.collection,
        depth: 0,
        overrideAccess: true,
      })) as null | Record<string, unknown>
    } catch (err) {
      if (opts.fallback) {return opts.fallback}
      throw new SMSProviderError(
        `byTenantLookup: failed to find ${opts.collection} ${id}`,
        { cause: err },
      )
    }

    const raw = doc?.[opts.providerField]
    if (typeof raw !== 'string' || raw.length === 0) {
      if (opts.fallback) {return opts.fallback}
      throw new SMSProviderError(
        `byTenantLookup: ${opts.collection}.${opts.providerField} is empty for id ${id}`,
      )
    }

    if (cache) {cache.set(id, { name: raw, at: Date.now() })}
    return raw
  }
}

export interface ByCountryPrefixOptions {
  fallback?: ProviderName
}

export const byCountryPrefix = (
  map: Record<string, ProviderName>,
  opts: ByCountryPrefixOptions = {},
): RouteFunction => {
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length)

  return async ({ message }) => {
    for (const [prefix, name] of entries) {
      if (message.to.startsWith(prefix)) {return name}
    }
    if (opts.fallback) {return opts.fallback}
    throw new SMSProviderError(
      `byCountryPrefix: no prefix matched ${JSON.stringify(message.to)} and no fallback provided`,
    )
  }
}

export const byRoundRobin = (providers: ProviderName[]): RouteFunction => {
  if (providers.length === 0) {
    throw new Error('byRoundRobin: providers list must be non-empty')
  }
  let counter = 0
  return async () => {
    const name = providers[counter]
    counter = (counter + 1) % providers.length
    return name
  }
}

export const byRandom = (providers: ProviderName[]): RouteFunction => {
  if (providers.length === 0) {
    throw new Error('byRandom: providers list must be non-empty')
  }
  return async () => providers[Math.floor(Math.random() * providers.length)]
}
