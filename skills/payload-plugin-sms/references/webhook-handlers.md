# Authoring webhook handlers

A provider webhook arrives at `${basePath}/${path ?? adapterName}` (POST). The plugin pipeline (`src/webhooks/endpoint.ts`) handles everything around `verify` and `parse`:

```
read raw body → verify(req, rawBody)?  → parse(req, rawBody) → applyStatusEvent(event)…
                  ↳ SMSWebhookVerificationError → 403
                  ↳ any other throw                → 500
                                       ↳ throw → 500
```

The handler's job is just `verify` and `parse`. Don't read the body twice — you get the raw `Buffer` from the pipeline.

## The `SMSWebhookHandler` interface

```ts
interface SMSWebhookHandler {
  verify: (req: PayloadRequest, rawBody: Buffer) => Promise<void> | void
  parse:  (req: PayloadRequest, rawBody: Buffer) => Promise<SMSStatusEvent[]> | SMSStatusEvent[]
  path?: string
}
```

`SMSStatusEvent`:

```ts
{
  providerMessageId: string  // MUST match the id you returned from send() — used to find the log row
  status: SMSStatus          // 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown'
  occurredAt: Date           // when the provider says the event happened, or new Date() if not given
  raw: unknown               // full webhook payload — kept for audit/debug
  errorCode?: string
  errorMessage?: string
  cost?: { amount: string; currency: string }
}
```

## Rules

1. **Verify against the raw bytes.** Don't `JSON.parse` first and re-stringify — provider signatures are computed over the exact bytes they sent, including key order and whitespace. Use `rawBody` directly.
2. **Throw `SMSWebhookVerificationError` on signature failure.** Generic `Error` becomes a 500; the typed error becomes a 403 (which is what providers expect for replay-detection / unauthorized).
3. **Use `node:crypto` `timingSafeEqual` for HMAC comparisons.** A naive `===` is timing-leaky. See `src/adapters/twilio/webhook.ts` `safeEqual` for the pattern (handle length mismatch by returning false before calling `timingSafeEqual`).
4. **Return `[]` from `parse` for empty / no-op bodies** (e.g. provider health checks). Don't throw.
5. **`providerMessageId` is the only thing that matters for matching.** `applyStatusEvent` does `find({ provider: adapterName, providerMessageId: event.providerMessageId })`. If the webhook payload's id doesn't match what the adapter's `send` returned, status updates silently miss with a "no matching log row" warning. Make sure `String(...)` coercions are consistent on both sides.
6. **Set `errorCode` / `errorMessage` only when present.** Don't include them as `undefined` properties in the returned object (clean output is easier to debug).
7. **Map provider statuses through `STATUS_MAP`.** Define one separately from the send-side map — webhooks usually have more states (delivery_failed, delivery_unconfirmed, etc.).

## The two common signature shapes

### HMAC over (URL + sorted form params) — Twilio

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { reconstructFullUrl } from '../../webhooks/fullUrl.js'

verify(req, rawBody) {
  const sig = (req as any).headers.get('x-twilio-signature')
  if (!sig) throw new SMSWebhookVerificationError('twilio: missing X-Twilio-Signature header')
  const fullUrl = reconstructFullUrl(req, Boolean(opts.trustProxy))
  const params = parseForm(rawBody)
  const sorted = Object.keys(params).sort()
  const data = sorted.reduce((acc, k) => acc + k + params[k], fullUrl)
  const expected = createHmac('sha1', opts.authToken).update(data).digest('base64')
  if (!safeEqual(sig, expected)) {
    throw new SMSWebhookVerificationError('twilio: signature mismatch')
  }
}
```

`reconstructFullUrl(req, trustProxy)` handles the `X-Forwarded-Proto/Host` rewriting. Always thread `trustProxy` from adapter options — it's how users behind CDNs/proxies make this work.

### Ed25519 over (timestamp + "|" + body) — Telnyx

```ts
import { createPublicKey, verify as edVerify } from 'node:crypto'

const publicKey = createPublicKey(opts.publicKey)  // do this once at adapter construction

verify(req, rawBody) {
  const sig = (req as any).headers.get('telnyx-signature-ed25519')
  const ts  = (req as any).headers.get('telnyx-timestamp')
  if (!sig || !ts) throw new SMSWebhookVerificationError('telnyx: missing headers')

  // Reject stale timestamps to defeat replay attacks.
  const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(ts))
  if (!Number.isFinite(drift) || drift > (opts.maxDriftSec ?? 300)) {
    throw new SMSWebhookVerificationError(`telnyx: timestamp drift ${drift}s exceeds max`)
  }

  const message = Buffer.concat([Buffer.from(ts), Buffer.from('|'), rawBody])
  let ok = false
  try {
    ok = edVerify(null, message, publicKey, Buffer.from(sig, 'base64'))
  } catch { ok = false }
  if (!ok) throw new SMSWebhookVerificationError('telnyx: signature mismatch')
}
```

A few patterns worth lifting from this:
- **Build the public key once** at adapter construction, not per-request — `createPublicKey` parses PEM.
- **Drift check.** Replay protection is part of verification, not parsing. Reject the whole request if the timestamp is too old (default 5 minutes).
- **Catch around `edVerify`** — bad inputs throw rather than returning false; we want `false`.

## Tests

Webhook tests need three things: a real signed payload, a fake `PayloadRequest`, and the raw `Buffer`.

```ts
const adapterName = 'acme'
const opts = { signingSecret: 'shh' }
const handler = makeAcmeWebhook(opts)

const rawBody = Buffer.from(JSON.stringify({ id: 'msg-1', status: 'delivered' }))
const sig = createHmac('sha256', opts.signingSecret).update(rawBody).digest('hex')

const req = {
  url: 'https://example.com/api/sms/webhooks/acme',
  headers: new Headers({ 'x-acme-signature': sig }),
} as unknown as PayloadRequest

await expect(handler.verify(req, rawBody)).resolves.toBeUndefined()
const events = await handler.parse(req, rawBody)
expect(events).toEqual([{
  providerMessageId: 'msg-1',
  status:            'delivered',
  occurredAt:        expect.any(Date),
  raw:               { id: 'msg-1', status: 'delivered' },
}])
```

Negative tests to include:
- Missing signature header → `SMSWebhookVerificationError`
- Wrong signature → `SMSWebhookVerificationError`
- Tampered body (re-sign with wrong key) → `SMSWebhookVerificationError`
- (For timestamped schemes) stale timestamp → `SMSWebhookVerificationError`
- Empty body → `parse` returns `[]`, doesn't throw
- Unknown provider status → mapped to `'unknown'`

Look at `src/adapters/twilio/webhook.test.ts` and `src/adapters/telnyx/webhook.test.ts` for working examples.
