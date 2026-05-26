import { describe, expect, test } from 'vitest'

import { readRawBody } from './rawBody.js'

const makeReq = (body: string | null): { body: ReadableStream<Uint8Array> | null } => {
  if (body === null) return { body: null }
  const enc = new TextEncoder().encode(body)
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc)
        controller.close()
      },
    }),
  }
}

describe('readRawBody', () => {
  test('reads the full body into a Buffer', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await readRawBody(makeReq('hello=world&foo=bar') as any)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.toString('utf8')).toBe('hello=world&foo=bar')
  })

  test('returns empty Buffer when body is null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await readRawBody(makeReq(null) as any)
    expect(buf.length).toBe(0)
  })

  test('preserves binary bytes', async () => {
    const bytes = new Uint8Array([0x00, 0x7f, 0xff, 0x10])
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await readRawBody({ body: stream } as any)
    expect(Array.from(buf)).toEqual([0x00, 0x7f, 0xff, 0x10])
  })
})
