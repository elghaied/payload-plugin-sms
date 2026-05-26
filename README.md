# payload-plugin-sms

Multi-provider SMS plugin for [Payload CMS](https://payloadcms.com) 3.x. Send SMS through Twilio, Telnyx, Plivo, Vonage, or AWS SNS — and call `payload.sendSMS(...)` from anywhere.

Architecture mirrors `@payloadcms/email-nodemailer`: a thin core defines an adapter interface, and each provider ships as a separate subpath export with the SDK declared as an optional peer dependency.

## Install

```bash
pnpm add payload-plugin-sms
```

Then install the SDK for your chosen provider:

```bash
pnpm add twilio                  # Twilio
pnpm add telnyx                  # Telnyx
pnpm add plivo                   # Plivo
pnpm add @vonage/server-sdk      # Vonage
pnpm add @aws-sdk/client-sns     # AWS SNS
```

## Quick start (Twilio)

```ts
import { buildConfig } from 'payload'
import { smsPlugin } from 'payload-plugin-sms'
import { twilioAdapter } from 'payload-plugin-sms/twilio'

export default buildConfig({
  plugins: [
    smsPlugin({
      adapter: twilioAdapter({
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        defaultFrom: process.env.TWILIO_FROM!,
      }),
      collections: { logs: true },
      widgets: true,
    }),
  ],
})
```

## Sending SMS

```ts
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [{ name: 'phone', type: 'text' }],
  hooks: {
    afterChange: [
      async ({ doc, req, operation }) => {
        if (operation === 'create' && doc.phone) {
          await req.payload.sendSMS({
            to: doc.phone,
            body: `Welcome ${doc.email}!`,
          })
        }
      },
    ],
  },
}
```

`to` must be E.164 (`+` then 1–15 digits). `from` falls back to plugin `defaultFrom`, then adapter `defaultFrom`.

## Adapters

### Twilio

```ts
import { twilioAdapter } from 'payload-plugin-sms/twilio'

twilioAdapter({
  accountSid: '...',
  authToken: '...',
  defaultFrom: '+15551234567',
  messagingServiceSid: 'MG...', // optional; supersedes `from`
})
```

### Telnyx

```ts
import { telnyxAdapter } from 'payload-plugin-sms/telnyx'

telnyxAdapter({
  apiKey: '...',
  defaultFrom: '+15551234567',
  messagingProfileId: '...', // optional
})
```

### Plivo

```ts
import { plivoAdapter } from 'payload-plugin-sms/plivo'

plivoAdapter({
  authId: '...',
  authToken: '...',
  defaultFrom: '+15551234567',
})
```

### Vonage

Uses the legacy SMS API (key + secret). The Messages API (JWT-authenticated) is on the roadmap.

```ts
import { vonageAdapter } from 'payload-plugin-sms/vonage'

vonageAdapter({
  apiKey: '...',
  apiSecret: '...',
  defaultFrom: '+15551234567',
})
```

### AWS SNS

SNS has no per-message `from`. `defaultFrom` is sent as the `AWS.SNS.SMS.SenderID` attribute (region-dependent support).

```ts
import { awsSnsAdapter } from 'payload-plugin-sms/aws-sns'

awsSnsAdapter({
  region: 'us-east-1',
  credentials: {                    // optional; falls back to default AWS credential chain
    accessKeyId: '...',
    secretAccessKey: '...',
  },
  defaultFrom: 'MYBRAND',           // sender ID
  smsType: 'Transactional',         // or 'Promotional'
})
```

### Mock (tests)

```ts
import { mockAdapter } from 'payload-plugin-sms/mock'

const adapter = mockAdapter({ defaultFrom: '+15550000000' })
adapter.messages  // array of sent messages
adapter.reset()   // clears it
```

## Plugin options

| Option              | Type                                                       | Default       | Notes                                                     |
| ------------------- | ---------------------------------------------------------- | ------------- | --------------------------------------------------------- |
| `adapter`           | `SMSAdapter`                                               | —             | Required at runtime. Missing adapter → `sendSMS` throws.  |
| `defaultFrom`       | `string`                                                   | —             | Falls back to adapter's `defaultFrom`.                    |
| `disabled`          | `boolean`                                                  | `false`       | Skips registration; logs a warning.                       |
| `collections.logs`  | `boolean \| { slug?: string; admin?: Record<...> }`        | `false`       | Creates an `sms-logs` collection.                         |
| `widgets`           | `boolean`                                                  | `true`        | Registers the dashboard widget when logs enabled.         |
| `onSend`            | `(args) => void \| Promise<void>`                          | —             | Called after every successful send.                       |
| `onError`           | `(args) => void \| Promise<void>`                          | —             | Called when send fails. Original error is re-thrown.      |

## Logs collection

Enable with `collections: { logs: true }`. Schema:

| Field               | Type     | Notes                                          |
| ------------------- | -------- | ---------------------------------------------- |
| `to`                | text     | Recipient                                      |
| `from`              | text     | Sender                                         |
| `body`              | textarea | Message body                                   |
| `provider`          | text     | Adapter name                                   |
| `status`            | select   | `queued`/`sent`/`delivered`/`failed`/`unknown` |
| `providerMessageId` | text     | Provider's message id                          |
| `cost`              | group    | `{ amount, currency }` when reported           |
| `error`             | textarea | Adapter error message (if any)                 |
| `sentAt`            | date     | Server timestamp                               |

Read access requires a logged-in admin user. Create/update/delete from the admin panel are blocked — the plugin is the only writer.

Override the slug:

```ts
collections: { logs: { slug: 'audit-sms', admin: { group: 'Audit' } } }
```

Note: if you override the slug, set `widgets: false` — the bundled widget reads from `sms-logs` only.

## Dashboard widget

When `widgets: true` and logs are enabled, the plugin registers an `admin.dashboard.widgets` entry that shows a 24h send count, the last 5 entries, and a link to the logs collection.

Disable with `widgets: false`.

## Router adapter (multi-provider)

For multi-tenant SaaS or geo-routing, wrap multiple adapters in a `routerAdapter` and decide per-send which one handles the message.

```ts
import { smsPlugin } from 'payload-plugin-sms'
import { twilioAdapter } from 'payload-plugin-sms/twilio'
import { telnyxAdapter } from 'payload-plugin-sms/telnyx'
import { routerAdapter, byTenantLookup } from 'payload-plugin-sms/router'

smsPlugin({
  adapter: routerAdapter({
    providers: {
      twilio: twilioAdapter({ accountSid, authToken }),
      telnyx: telnyxAdapter({ apiKey }),
    },
    route: byTenantLookup({
      collection: 'tenants',
      providerField: 'smsProvider',
      cacheMs: 60_000,
    }),
  }),
  collections: { logs: { includeContext: true } },
})
```

At the call site, attach the tenant id (and any per-tenant `from`):

```ts
await req.payload.sendSMS({
  to: customer.phone,
  from: tenant.smsFromNumber,
  body: '...',
  context: { tenantId: tenant.id },
})
```

The router is just another `SMSAdapter`. Single-provider users (`smsPlugin({ adapter: twilioAdapter(...) })`) are unaffected.

### Route helpers

| Helper | Use |
|---|---|
| `byTenantLookup({ collection, providerField, contextKey?, cacheMs?, fallback? })` | SaaS: read tenant id from `message.context`, fetch the doc, return its provider field |
| `byCountryPrefix({ '+1': 'twilio', '+33': 'telnyx' }, { fallback? })` | Geo route by E.164 prefix; longest-prefix wins |
| `byRoundRobin(['twilio-a', 'twilio-b'])` | Cycle across duplicate accounts |
| `byRandom(['twilio-a', 'twilio-b'])` | Uniform random pick |
| `withFailover(inner, ['fallback-a', 'fallback-b'])` | Wrap any route; on `SMSProviderError`, try the next provider in order |

You can also write a `route` callback directly — it's just `(args) => string \| string[]` (or async).

### `context`

`SMSMessage.context` is an opaque per-send map. It flows to the route function, the `onSend`/`onError` hooks (via `args.message`), and — when `collections.logs.includeContext: true` — into a `context` (JSON) field on the `sms-logs` collection.

### Failover semantics

A route returning a single provider name calls that provider once. Returning an array `['a', 'b']` tries each in order on `SMSProviderError`; if all fail the router throws a single `SMSProviderError` whose `.cause` is an array of the individual errors. `SMSValidationError` is never retried.

## Hooks (onSend, onError)

```ts
smsPlugin({
  adapter: twilioAdapter({ ... }),
  onSend: async ({ result, req }) => {
    console.log(`Sent ${result.id} via ${result.provider} to ${result.to}`)
  },
  onError: async ({ error, message, req }) => {
    console.error(`Failed to send to ${message.to}:`, error)
  },
})
```

Hook failures are logged but do not affect the SMS send result. `req` is `undefined` when called via `payload.sendSMS` (Payload's local API does not thread `req` through dynamic methods).

## Errors

```ts
import { SMSValidationError, SMSProviderError } from 'payload-plugin-sms'

try {
  await payload.sendSMS({ to: 'not-e164', body: 'hi' })
} catch (err) {
  if (err instanceof SMSValidationError) {
    // Bad input (E.164 fail, missing from, missing adapter)
  } else if (err instanceof SMSProviderError) {
    // Adapter call failed; `err.cause` has the original SDK error
  }
}
```

## Delivery-status webhooks

Enable provider webhooks to keep `sms-logs` rows in sync with real delivery state.

```ts
import { smsPlugin } from 'payload-plugin-sms'
import { twilioAdapter } from 'payload-plugin-sms/twilio'

export default buildConfig({
  // ...
  plugins: [
    smsPlugin({
      adapter: twilioAdapter({
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        defaultFrom: process.env.TWILIO_FROM,
        webhook: { trustProxy: true }, // optional, if behind a proxy
      }),
      collections: { logs: { statusHistory: true } },
      webhooks: { enabled: true },
      onStatus: ({ event, log }) => {
        // optional: notify your app on every status transition
      },
    }),
  ],
})
```

Webhook URLs (Payload prepends `/api`):

| Provider | URL                              | Required adapter `webhook` opts                                                         |
| -------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Twilio   | `/api/sms/webhooks/twilio`       | (none — uses `authToken`)                                                               |
| Telnyx   | `/api/sms/webhooks/telnyx`       | `publicKey` (Ed25519 PEM, from Telnyx portal)                                           |
| Plivo    | `/api/sms/webhooks/plivo`        | (none — uses `authToken`)                                                               |
| Vonage   | `/api/sms/webhooks/vonage`       | `signatureSecret`, `signatureMethod: 'sha256hash' \| 'sha512hash'`                      |
| AWS SNS  | `/api/sms/webhooks/aws-sns`      | (none — verified via `SigningCertURL`; auto-confirms `SubscriptionConfirmation`)        |

Notes:

- Signature verification is **on by default**. Set `webhooks.verifySignature: false` only for local testing.
- Status updates are gated by rank (`queued → sent → delivered`, with `failed` terminal), so out-of-order or duplicate webhooks are dropped silently.
- Set `collections.logs.statusHistory: true` to keep an append-only history of every event.
- Vonage plain MD5 signing is **not supported** (insecure). Use `sha256hash` or `sha512hash`.
- Twilio and Plivo do not sign timestamps — those providers cannot prevent replay attacks at the signature layer.

## Roadmap

- Bulk / batch send
- Templating (variable substitution, localization)
- Per-recipient rate limiting
- Inbound SMS handling
- Vonage Messages API (JWT, MMS, WhatsApp)
- MessageBird/Bird, Sinch, Infobip adapters

PRs welcome.

## Compatibility

- Payload `^3.0.0` (tested against `3.84.1`)
- Next.js `^16.0.0`
- Node `^18.20.2 || >=20.9.0`
- React 19 is an optional peer dependency — required only if you use the dashboard widget (`payload-plugin-sms/rsc`).

## License

MIT
