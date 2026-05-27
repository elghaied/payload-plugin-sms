# Adding a new SMS provider adapter

Walkthrough for adding a provider to this repo. The architecture is intentionally narrow — every adapter is a single factory function returning `SMSAdapter`. The shortest correct adapter is ~40 lines.

## Checklist

1. Pick a stable `name` (lowercase, no spaces — used as default webhook path segment and as the `provider` value on logs).
2. Add the SDK to `package.json`:
   - `peerDependencies`: `"<sdk>": "^X.0.0"`
   - `peerDependenciesMeta`: `"<sdk>": { "optional": true }`
   - `devDependencies`: same `<sdk>` at a concrete version (so tests/dev playground can import it).
3. Add a subpath export to **both** `exports` (source) and `publishConfig.exports` (built dist) in `package.json`.
4. Create `src/adapters/<name>/index.ts` — the factory.
5. If the provider has status webhooks, create `src/adapters/<name>/webhook.ts` (see `webhook-handlers.md`).
6. Add tests in the same folder.

## Skeleton: `index.ts`

```ts
import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSResult,
  SMSStatus,
  SMSWebhookHandler,
} from '../../types.js'
import { SMSProviderError } from '../../errors.js'
import { makeAcmeWebhook } from './webhook.js'

export interface AcmeAdapterOptions {
  apiKey: string
  defaultFrom?: string
  webhook?: { path?: string; signingSecret: string } | false
}

const STATUS_MAP: Record<string, SMSStatus> = {
  queued:    'queued',
  sent:      'sent',
  delivered: 'delivered',
  failed:    'failed',
  // anything not listed falls through to 'unknown'
}

const mapStatus = (s: string | null | undefined): SMSStatus =>
  s ? (STATUS_MAP[s] ?? 'unknown') : 'unknown'

// Dynamic import so consumers who don't use this provider don't need the SDK.
const loadAcme = async () => {
  try {
    const mod = await import('acme-sdk')
    return (mod as any).default ?? (mod as any)
  } catch (err) {
    throw new SMSProviderError(
      "Install 'acme-sdk' to use the Acme adapter (pnpm add acme-sdk)",
      { cause: err },
    )
  }
}

const buildWebhook = (opts: AcmeAdapterOptions): SMSWebhookHandler | undefined => {
  if (!opts.webhook) {return undefined}
  const handler = makeAcmeWebhook({ signingSecret: opts.webhook.signingSecret })
  return opts.webhook.path ? { ...handler, path: opts.webhook.path } : handler
}

export const acmeAdapter = (opts: AcmeAdapterOptions): SMSAdapter => ({
  name: 'acme',
  defaultFrom: opts.defaultFrom,
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const Acme = await loadAcme()
    const client = new Acme({ apiKey: opts.apiKey })

    try {
      const response = await client.messages.create({
        to:   message.to,
        from: message.from,
        body: message.body,
        ...(message.mediaUrls?.length ? { media: message.mediaUrls } : {}),
      })
      return {
        id:        String(response.id),
        body:      message.body,
        from:      message.from,
        to:        message.to,
        provider:  'acme',
        raw:       response,
        sentAt:    new Date(),
        status:    mapStatus(response.status),
        // cost: { amount: ..., currency: ... } if the provider returns it
      }
    } catch (err) {
      throw new SMSProviderError(`Acme send failed: ${(err as Error).message}`, { cause: err })
    }
  },
  webhook: buildWebhook(opts),
})
```

## Things to copy verbatim from existing adapters

- The `loadAcme` pattern (try/catch dynamic import → `SMSProviderError` with install hint). Don't switch to a top-level `import` — that breaks the optional-SDK contract.
- The `STATUS_MAP` constant + `mapStatus` helper. Define one in `index.ts` for send-time status (less rich, just queued/sent/etc.) and a separate, usually richer one in `webhook.ts` for delivery-receipt statuses. Some providers use different vocabularies for the two cases (Telnyx is a good example).
- Wrapping all provider exceptions in `SMSProviderError`. The router's failover logic only retries `SMSProviderError` — anything else (e.g. `SMSValidationError`) is rethrown immediately.
- `name` and `provider` must match — the field gets written to logs and is what `applyStatusEvent` queries on.

## Things that vary by provider — watch out for

- **`from` semantics.** Twilio supports `messagingServiceSid` instead of a phone number; if set, omit `from` from the API payload. Plivo uses `src` not `from`. AWS SNS has no `from` at all — pick a `defaultFrom` placeholder and ignore it in `send`.
- **Auth pattern.** Account SID + token (Twilio), API key (Telnyx), auth ID + token (Plivo), key + secret (Vonage), AWS SigV4 (AWS SNS).
- **Response shape.** Read the SDK's actual response type — `.sid` vs `.id` vs `.data.id`, `.price`/`.priceUnit` vs cost object vs not at all. Capture the full response in `raw` regardless — it's audit-grade and consumers can dig into it.
- **Idempotency.** Some providers (Plivo) return an array even for a single recipient. Handle the array case.
- **Sandbox numbers.** Twilio's magic numbers (`+15005550006` succeeds, `+15005550001` fails). Useful in tests.

## Tests

Tests live next to the adapter (`src/adapters/<name>/index.test.ts`). Pattern:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('acme-sdk', () => {
  const create = vi.fn().mockResolvedValue({ id: 'msg-1', status: 'queued' })
  return { default: vi.fn(() => ({ messages: { create } })), __create: create }
})

import { acmeAdapter } from './index.js'

describe('acmeAdapter', () => {
  it('returns an SMSResult with id, provider, and mapped status', async () => {
    const adapter = acmeAdapter({ apiKey: 'k', defaultFrom: '+15551110000' })
    const result = await adapter.send({
      to:   '+15552220000',
      from: '+15551110000',
      body: 'hi',
    })
    expect(result).toMatchObject({
      id:       'msg-1',
      provider: 'acme',
      status:   'queued',
      to:       '+15552220000',
    })
  })

  it('throws SMSProviderError on SDK error', async () => {
    /* set up mock to reject, expect SMSProviderError */
  })

  it('maps unknown provider statuses to "unknown"', () => {
    /* if your STATUS_MAP is exported, test it directly */
  })
})
```

Also test:
- Empty `mediaUrls` doesn't add the field; populated `mediaUrls` does.
- `messagingServiceSid` / equivalent overrides `from` if the provider supports it.
- The SDK import-failure path (mock `acme-sdk` to throw inside the dynamic import).

For webhook tests see `webhook-handlers.md` — they have a separate shape because signature math has to be exact.

## Package.json updates

Add the export in **both** places. The dual entries exist because source vs dist resolution differs:

```jsonc
// "exports" — used during `pnpm dev` and by consumers who import the source
"./acme": {
  "import":  "./src/adapters/acme/index.ts",
  "types":   "./src/adapters/acme/index.ts",
  "default": "./src/adapters/acme/index.ts"
},
// "publishConfig.exports" — used after `pnpm build`, what npm consumers see
"./acme": {
  "import":  "./dist/adapters/acme/index.js",
  "types":   "./dist/adapters/acme/index.d.ts",
  "default": "./dist/adapters/acme/index.js"
}
```

Forget the `publishConfig.exports` entry and the adapter silently won't be importable for end users — `pnpm test` still passes because it runs against source.

Also add the provider name to the `keywords` array in `package.json` if it's well-known.

## README

Add a short section under `## Adapters` matching the existing structure (constructor options + the few quirks the user needs to know about). Keep it terse.
