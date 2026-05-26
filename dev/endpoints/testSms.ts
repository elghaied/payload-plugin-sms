import type { Endpoint } from 'payload'

export const testSmsEndpoint: Endpoint = {
  path: '/test-sms',
  method: 'get',
  handler: async (req) => {
    const url = new URL(req.url ?? 'http://localhost/api/test-sms', 'http://localhost')
    const to = url.searchParams.get('to')
    const body = url.searchParams.get('body') ?? 'Hello from Payload'

    if (!to) {
      return Response.json({ error: 'missing ?to= query param' }, { status: 400 })
    }

    try {
      const result = await req.payload.sendSMS({ to, body })
      return Response.json({ ok: true, result })
    } catch (err) {
      return Response.json(
        { ok: false, error: (err as Error).message },
        { status: 500 },
      )
    }
  },
}
