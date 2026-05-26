import type {
  RoutedSMSAdapter,
  SMSAdapter,
  SMSWebhookHandler,
} from '../types.js'

export interface WebhookHandlerEntry {
  adapterName: string
  handler: SMSWebhookHandler
}

const isRouted = (a: SMSAdapter): a is RoutedSMSAdapter =>
  Array.isArray((a as RoutedSMSAdapter).webhooks)

export const collectWebhookHandlers = (
  adapter: SMSAdapter | undefined,
): WebhookHandlerEntry[] => {
  if (!adapter) return []
  if (isRouted(adapter)) return adapter.webhooks
  if (adapter.webhook) {
    return [{ adapterName: adapter.name, handler: adapter.webhook }]
  }
  return []
}

const resolvePath = (entry: WebhookHandlerEntry): string =>
  entry.handler.path ?? entry.adapterName

export const assertUniquePaths = (entries: WebhookHandlerEntry[]): void => {
  const seen = new Set<string>()
  for (const e of entries) {
    const p = resolvePath(e)
    if (seen.has(p)) {
      throw new Error(
        `payload-plugin-sms: duplicate webhook path "${p}". Set a distinct \`webhook.path\` on the conflicting adapter.`,
      )
    }
    seen.add(p)
  }
}

export { resolvePath }
