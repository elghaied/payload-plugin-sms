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

## Roadmap

- Delivery-status webhooks (Twilio, Telnyx, Plivo)
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
