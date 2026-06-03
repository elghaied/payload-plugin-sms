/**
 * Public delivery-status callback URL the plugin hands providers on send, derived
 * from the consumer's serverURL + webhook base path. Returns undefined when serverURL
 * is missing, unparseable, or points at localhost (so dev sends don't hand the provider
 * an unreachable callback). An explicit override is applied by the caller, not here.
 */
export const deriveStatusCallbackUrl = (args: {
  basePath: string
  serverURL?: string
  webhookPath: string
}): string | undefined => {
  const { basePath, serverURL, webhookPath } = args
  if (!serverURL) {return undefined}
  let host: string
  try {
    host = new URL(serverURL).hostname
  } catch {
    return undefined
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {return undefined}
  return `${serverURL.replace(/\/$/, '')}/api${basePath}/${webhookPath}`
}
