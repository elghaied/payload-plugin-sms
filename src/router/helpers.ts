import { SMSProviderError } from '../errors.js'

import type { ProviderName, RouteFunction } from './types.js'

export interface ByTenantLookupOptions {
  collection: string
  contextKey?: string
  providerField: string
  cacheMs?: number
  fallback?: ProviderName
}

interface CacheEntry {
  name: ProviderName
  at: number
}

export const byTenantLookup = (opts: ByTenantLookupOptions): RouteFunction => {
  const contextKey = opts.contextKey ?? 'tenantId'
  const cache = opts.cacheMs ? new Map<string, CacheEntry>() : undefined

  return async ({ message, payload }) => {
    const rawId = message.context?.[contextKey]
    if (typeof rawId !== 'string' || rawId.length === 0) {
      if (opts.fallback) return opts.fallback
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

    let doc: Record<string, unknown> | null
    try {
      doc = (await payload.findByID({
        collection: opts.collection,
        id,
        depth: 0,
        overrideAccess: true,
      })) as Record<string, unknown> | null
    } catch (err) {
      if (opts.fallback) return opts.fallback
      throw new SMSProviderError(
        `byTenantLookup: failed to find ${opts.collection} ${id}`,
        { cause: err },
      )
    }

    const raw = doc?.[opts.providerField]
    if (typeof raw !== 'string' || raw.length === 0) {
      if (opts.fallback) return opts.fallback
      throw new SMSProviderError(
        `byTenantLookup: ${opts.collection}.${opts.providerField} is empty for id ${id}`,
      )
    }

    if (cache) cache.set(id, { name: raw, at: Date.now() })
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
      if (message.to.startsWith(prefix)) return name
    }
    if (opts.fallback) return opts.fallback
    throw new SMSProviderError(
      `byCountryPrefix: no prefix matched ${JSON.stringify(message.to)} and no fallback provided`,
    )
  }
}
