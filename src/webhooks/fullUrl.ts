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
    if (proto) u.protocol = `${proto}:`
    if (host) {
      u.hostname = host
      u.port = ''
    }
  }
  return u.toString()
}
