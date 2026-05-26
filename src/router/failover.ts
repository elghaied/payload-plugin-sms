import type { ProviderName, RouteFunction } from './types.js'

export const withFailover = (
  inner: RouteFunction,
  fallbackOrder: ProviderName[],
): RouteFunction =>
  async (args) => {
    const raw = await inner(args)
    if (Array.isArray(raw)) {return raw}
    return [raw, ...fallbackOrder.filter((p) => p !== raw)]
  }
