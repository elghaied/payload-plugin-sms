---
name: payload-plugin-sms
description: Expert guide for the @elghaied/payload-plugin-sms package — a multi-provider SMS plugin for Payload CMS 3.x (Twilio, Telnyx, Plivo, Vonage, AWS SNS, plus a router for failover/multi-tenant routing). Use whenever the user mentions this package or any of its concepts — `smsPlugin`, `payload.sendSMS`, `SMSAdapter`, an `sms-logs` collection, a status webhook from an SMS provider, signature verification (X-Twilio-Signature / Telnyx-Signature-Ed25519 / etc.), E.164 validation, or wiring/configuring/debugging SMS in a Payload app. Also use when adding a new SMS provider adapter to this repo, authoring a webhook handler, debugging "no matching log row" or "signature mismatch" warnings, or when working in files under `src/adapters/`, `src/webhooks/`, `src/sendSMS.ts`, or `src/plugin.ts` of this repository. Use even if the user does not name the package — phrases like "send a text message from Payload", "Twilio adapter not sending", or "wire up Plivo webhooks" all count.
---

# payload-plugin-sms

Multi-provider SMS plugin for Payload CMS 3.x. Architecturally it mirrors `@payloadcms/email-nodemailer`: a thin core defines a single `SMSAdapter` interface, and each provider ships as a separate subpath export (`@elghaied/payload-plugin-sms/twilio`, `/telnyx`, `/plivo`, `/vonage`, `/aws-sns`, `/mock`, `/router`). The provider SDK is declared as an **optional** peer dependency and loaded with dynamic `import()` so unused providers don't bloat consumer installs.

This skill covers four tasks. Jump to the relevant reference for any task that's not a small tweak.

| Task | Reference |
| --- | --- |
| Wire the plugin into a Payload app (consumer) | [references/configuring.md](references/configuring.md) |
| Add a new provider adapter to this repo | [references/adding-an-adapter.md](references/adding-an-adapter.md) |
| Author or fix a provider webhook handler | [references/webhook-handlers.md](references/webhook-handlers.md) |
| Debug delivery / webhook problems | [references/debugging.md](references/debugging.md) |

## The core contracts

Read this section before touching any adapter or webhook code — these are the invariants the rest of the plugin assumes.

### `SMSAdapter`

Every provider implements this single interface (`src/types.ts`):

```ts
interface SMSAdapter {
  name: string                          // stable provider id; used as default webhook path segment + provider key on logs
  defaultFrom?: string
  init?: (payload: Payload) => Promise<void> | void
  send: (message: OutboundSMSMessage) => Promise<SMSResult>
  webhook?: SMSWebhookHandler
}
```

`name` matters: it's written into the `provider` field on every log row and is what `applyStatusEvent` matches on when a status webhook arrives. Don't rename it casually.

### Phone numbers are validated as E.164

`sendSMS` rejects any `to` that doesn't match `/^\+[1-9]\d{1,14}$/` with `SMSValidationError` *before* hitting the adapter. Adapters do not need to revalidate `to`. They also receive a fully-resolved `from` (sendSMS handles the fallback chain: `message.from` → `pluginConfig.defaultFrom` → `adapter.defaultFrom`). If none of those produce a value, sendSMS throws before calling the adapter — so `OutboundSMSMessage.from` is always a string.

### `SMSResult` and `SMSStatus`

```ts
type SMSStatus = 'delivered' | 'failed' | 'queued' | 'sent' | 'unknown'

interface SMSResult {
  id: string         // provider message id — also written to log.providerMessageId
  body: string
  from: string
  to: string
  provider: string   // adapter.name (router overwrites with child key)
  status: SMSStatus
  sentAt: Date
  raw: unknown       // keep the full provider response — it's audit gold
  cost?: { amount: string; currency: string }
  context?: Record<string, unknown>
}
```

The five statuses are deliberately small. Map provider-specific values into them with a `STATUS_MAP` constant; unknown strings should fall through to `'unknown'`, not crash.

### Status rank — webhooks only advance, never regress

`src/webhooks/rank.ts` defines:

```
queued(0) → sent(1) → delivered(2)        failed(99)        unknown(-1)
```

`applyStatusEvent` only writes the new status if `rankStatus(incoming) > rankStatus(current)`. This matters because providers re-deliver out-of-order webhooks all the time — a stale `queued` arriving after `delivered` must not overwrite `delivered`. If you're adding a new status, decide its rank first; misranking is silently destructive.

`failed` is terminal — it has the highest rank specifically so any later event is ignored.

### Optional peer-dep pattern

Each provider's SDK is in `peerDependencies` with `peerDependenciesMeta.<sdk>.optional = true`. The adapter loads it at call time:

```ts
const loadTwilio = async () => {
  try {
    const mod = await import('twilio')
    return (mod as any).default ?? (mod as any)
  } catch (err) {
    throw new SMSProviderError(
      "Install 'twilio' to use the Twilio adapter (pnpm add twilio)",
      { cause: err },
    )
  }
}
```

Do this even if the SDK feels universal. Consumers who pick one provider should not need to install the other four.

### Webhook handler shape

```ts
interface SMSWebhookHandler {
  verify: (req, rawBody) => Promise<void> | void   // throw SMSWebhookVerificationError on failure
  parse:  (req, rawBody) => Promise<SMSStatusEvent[]> | SMSStatusEvent[]
  path?: string                                     // defaults to adapter.name under basePath
}
```

The endpoint pipeline (`src/webhooks/endpoint.ts`) is fixed: read raw body → call `verify` (if `pluginConfig.webhooks.verifySignature !== false`) → call `parse` → fan out events to `applyStatusEvent`. Handlers must:

- Use the **raw** Buffer for signature verification — never re-serialize the parsed JSON. Most providers sign the exact bytes they sent.
- Throw `SMSWebhookVerificationError` (not generic `Error`) on signature failure so the endpoint returns 403 instead of 500.
- Return an empty array from `parse` for empty/no-op payloads. Don't throw.
- Never silently pass on invalid signatures — that defeats the entire mechanism.

### Hooks never block sends

`onSend`, `onError`, `onStatus` are all called inside `try/catch` and logged with `payload.logger.warn` on failure. They will not abort a send or webhook. This is intentional — consumer code in a notification hook shouldn't be able to break SMS delivery. Don't change this contract.

## Plugin shape

`smsPlugin(config)(payloadConfig)` is a standard Payload plugin function. At config time it:

1. Optionally appends an `sms-logs` collection (slug configurable; `includeContext` and `statusHistory` toggle optional fields).
2. Optionally adds the `SMSLogsWidget` to the admin dashboard. **Widget only appears with the default `sms-logs` slug** — a custom slug silently disables it (with a warning at init).
3. Collects webhook handlers (handles both single adapters and `routerAdapter`, which exposes `webhooks: Array<{ adapterName, handler }>`) and registers a POST endpoint per handler at `${basePath}/${path ?? adapterName}`. `basePath` defaults to `/sms/webhooks`.
4. Asserts webhook paths are unique — duplicates throw at config time.
5. In `onInit`, attaches `payload.sendSMS` (typed via the `BasePayload` augmentation in `src/augment.ts`).

A consumer can call `req.payload.sendSMS({ to, body })` from anywhere — hooks, endpoints, jobs.

## When the user is wiring up the plugin

The most common consumer mistakes — flag these proactively rather than waiting for the user to hit them:

- **Missing SDK.** They installed the plugin but not `twilio` / `telnyx` / etc. Symptom: `SMSProviderError: Install 'twilio'...` at first send.
- **`to` isn't E.164.** No `+`, country code missing, or extra formatting. Symptom: `SMSValidationError` before the adapter runs.
- **No `from` anywhere.** None of `message.from`, `pluginConfig.defaultFrom`, `adapter.defaultFrom` set. Symptom: `SMSValidationError: No 'from' resolved`. (Twilio with `messagingServiceSid` is an exception — it ignores `from`.)
- **Webhooks enabled but logs disabled.** Status updates have nowhere to land. Plugin warns at init.
- **Webhooks enabled but adapter has no `webhook`.** Plugin warns at init — no endpoints get registered. AWS SNS, for example, only has a webhook for inbound; Vonage's adapter ships one only if you opt in.
- **`verifySignature: false` in production.** Allowed but warned at init. Only useful for local development without a public tunnel.
- **Custom logs slug + widget.** Widget hard-codes `sms-logs`. Set `widgets: false` explicitly to silence the warning, or use the default slug.
- **No `WEBHOOK_PUBLIC_URL` configured on the provider side.** The plugin only registers the *server-side* endpoint. The user still has to paste `https://their-app.com/api/sms/webhooks/twilio` into the provider portal.

## When the user is adding a new adapter

The shortest correct path:

1. Pick a provider `name` (lowercase, stable, used as default webhook path).
2. Add the SDK to `peerDependencies` (optional) and `devDependencies` (so tests can import it).
3. Add a subpath export in `package.json` (both `exports.` and `publishConfig.exports.`) pointing at `./src/adapters/<name>/index.ts` and `./dist/adapters/<name>/index.js`.
4. Create `src/adapters/<name>/index.ts` exporting a factory `<name>Adapter(opts): SMSAdapter`.
5. If the provider has delivery webhooks, create `src/adapters/<name>/webhook.ts` with `make<Name>Webhook(opts): SMSWebhookHandler`.
6. Write unit tests for `send`, status mapping, and webhook verify/parse (positive + negative). Tests use the same pattern across adapters — copy `src/adapters/twilio/index.test.ts` as a starting point and adapt.

See [references/adding-an-adapter.md](references/adding-an-adapter.md) for the full walkthrough with code skeletons and provider-quirk notes.

## When the user is debugging

Go to [references/debugging.md](references/debugging.md) — it has a symptom-keyed flowchart for the common failure modes (`SMSValidationError`, `SMSProviderError`, `signature mismatch`, `no matching log row`, status stuck at `queued`).

## House style

- TypeScript, ESM, `.js` extensions in imports (the codebase uses NodeNext-style imports even in `.ts` source).
- Errors are concrete classes from `src/errors.ts` (`SMSValidationError`, `SMSProviderError`, `SMSWebhookVerificationError`). Don't introduce a generic `Error` where one of these would fit — the endpoint pipeline branches on these classes.
- Tests are vitest (`pnpm test`). Adapter tests mock the SDK with `vi.mock(...)`. Webhook tests build a fake `PayloadRequest` with a `Headers` object.
- Linting: `pnpm lint` / `pnpm lint:fix`. ESLint config is in `eslint.config.js`.
- The dev playground (`pnpm dev`) runs a Next.js app from `dev/payload.config.ts` against an in-memory MongoDB.
