import type { Endpoint } from 'payload'

export const testSmsEndpoint: Endpoint = {
  handler: async (req) => {
    const url = new URL(req.url ?? 'http://localhost/api/test-sms', 'http://localhost')
    const to = url.searchParams.get('to')
    const body = url.searchParams.get('body') ?? 'Hello from Payload'

    if (!to) {
      return Response.json({ error: 'missing ?to= query param' }, { status: 400 })
    }

    try {
      const result = await req.payload.sendSMS({ body, to })
      return Response.json({ ok: true, result })
    } catch (err) {
      return Response.json(
        { error: (err as Error).message, ok: false },
        { status: 500 },
      )
    }
  },
  method: 'get',
  path: '/test-sms',
}
