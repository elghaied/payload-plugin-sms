import type { PayloadRequest } from 'payload'

export const readRawBody = async (req: PayloadRequest): Promise<Buffer> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (req as any).body as ReadableStream<Uint8Array> | null | undefined
  if (!body) return Buffer.alloc(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return Buffer.from(out)
}
