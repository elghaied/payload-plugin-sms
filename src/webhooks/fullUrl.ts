import type { PayloadRequest } from 'payload'

export const reconstructFullUrl = (
  req: PayloadRequest,
  trustProxy: boolean,
): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = new URL((req as any).url as string)
  if (trustProxy) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (req as any).headers as Headers
    const proto = headers.get('x-forwarded-proto')
    const host = headers.get('x-forwarded-host')
    if (proto) {u.protocol = `${proto}:`}
    if (host) {
      const colon = host.indexOf(':')
      if (colon === -1) {
        u.hostname = host
        u.port = ''
      } else {
        u.hostname = host.slice(0, colon)
        u.port = host.slice(colon + 1)
      }
    }
  }
  return u.toString()
}
