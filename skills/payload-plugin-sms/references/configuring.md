# Configuring the plugin in a Payload app

This reference is for the **consumer side** — wiring `@elghaied/payload-plugin-sms` into a downstream Payload project. For modifying the plugin itself, see `adding-an-adapter.md` or `webhook-handlers.md`.

## Minimal setup (Twilio)

```bash
pnpm add @elghaied/payload-plugin-sms twilio
```

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { smsPlugin } from '@elghaied/payload-plugin-sms'
import { twilioAdapter } from '@elghaied/payload-plugin-sms/twilio'

export default buildConfig({
  // ...
  plugins: [
    smsPlugin({
      adapter: twilioAdapter({
        accountSid: process.env.TWILIO_ACCOUNT_SID!,
        authToken: process.env.TWILIO_AUTH_TOKEN!,
        defaultFrom: process.env.TWILIO_FROM!, // e.g. "+15551234567"
      }),
      collections: { logs: true },
      widgets: true,
    }),
  ],
})
```

After this, `req.payload.sendSMS({ to: '+15551234567', body: 'hi' })` works from any hook, endpoint, or job.

## `SMSPluginConfig` — the full surface

| Field | Type | Notes |
| --- | --- | --- |
| `adapter` | `SMSAdapter` | Required for sends to work. If absent, `sendSMS` throws and a warning logs at init. |
| `defaultFrom` | `string` | Fallback `from` used when neither the message nor the adapter sets one. |
| `disabled` | `boolean` | Short-circuits the plugin. Useful for dev/test toggles. |
| `collections.logs` | `boolean \| SMSLogsCollectionOptions` | Adds the `sms-logs` collection. Required for webhook status updates to land anywhere. |
| `widgets` | `boolean` | Adds the recent-logs dashboard widget. Default `true`. **Only takes effect with the default `sms-logs` slug.** |
| `webhooks.enabled` | `boolean` | Default `false`. Set `true` to register POST endpoints for the adapter's webhook handler(s). |
| `webhooks.basePath` | `string` | Default `/sms/webhooks`. Each handler is mounted at `${basePath}/${adapter.name}` (or its `webhook.path`). |
| `webhooks.verifySignature` | `boolean` | Default `true`. Disable only for local development. |
| `webhooks.trustProxy` | `boolean` | Pass through to Twilio webhook for `X-Forwarded-Proto/Host` URL reconstruction. |
| `onSend({ result, req })` | hook | Fires after every successful send. Errors are caught and logged — they will not abort the send. |
| `onError({ error, message, req })` | hook | Fires on send failure. Same swallow-and-log behavior. |
| `onStatus({ event, log, req })` | hook | Fires on every webhook status event after the log row is updated. |

## `SMSLogsCollectionOptions`

```ts
collections: {
  logs: {
    slug: 'sms-logs',     // default; changing it disables the dashboard widget
    includeContext: false, // adds a `context` JSON field; stores message.context on the log row
    statusHistory: false,  // adds a `statusHistory` array; appends one entry per webhook event
    admin: { /* override admin config */ },
  },
}
```

The logs collection is read-only by default (`create/update/delete` access return `false`). Authenticated users can read it. If you need different access, override via the `admin` field — but be careful: the plugin assumes nothing else writes to this collection.

`statusHistory: true` is the right choice if you ever need to debug delivery — it preserves the full webhook timeline even when the rank-based update logic decides not to advance `status`.

## Sending

```ts
await req.payload.sendSMS({
  to: '+15551234567',           // E.164 required
  body: 'Your code is 123456',
  from: '+15557654321',          // optional; falls back to plugin/adapter defaultFrom
  mediaUrls: ['https://...'],    // optional MMS
  context: { userId: doc.id },   // optional; surfaces in logs and onSend hook
})
```

`SMSValidationError` if `to` isn't E.164 or no `from` can be resolved. `SMSProviderError` for anything the provider rejects (auth, blocked number, rate limit, etc.).

Common consumer mistake: storing user phone numbers without normalizing to E.164. Add a `validate` or `beforeChange` hook on your user/contact field — the plugin won't fix arbitrary formatting.

## Multiple providers — `routerAdapter`

```ts
import { routerAdapter, byCountryPrefix } from '@elghaied/payload-plugin-sms/router'
import { twilioAdapter } from '@elghaied/payload-plugin-sms/twilio'
import { telnyxAdapter } from '@elghaied/payload-plugin-sms/telnyx'

smsPlugin({
  adapter: routerAdapter({
    providers: {
      twilio: twilioAdapter({ /* ... */ }),
      telnyx: telnyxAdapter({ /* ... */ }),
    },
    route: byCountryPrefix({ '+1': 'twilio', default: 'telnyx' }),
  }),
})
```

The router exposes **both** child webhooks — they get registered at `/sms/webhooks/twilio` and `/sms/webhooks/telnyx` automatically. The `provider` field on logs is the child key (`'twilio'`/`'telnyx'`), not `'router'`, so webhook lookups still match.

`route` can return a single key or an array; arrays mean failover — each is tried in order until one succeeds. See `references/webhook-handlers.md` if you're combining failover with webhooks (status events still need to find their original log row, which is keyed on the successful provider).

## Webhooks — full setup

```ts
smsPlugin({
  adapter: twilioAdapter({
    /* ... */,
    // Optional per-adapter webhook config:
    webhook: { path: 'twilio-status', trustProxy: true },
  }),
  collections: { logs: { statusHistory: true } }, // required for updates to land
  webhooks: {
    enabled: true,
    verifySignature: true,
    trustProxy: true, // if your app sits behind a proxy/CDN
  },
})
```

Then in the provider portal, set the status-callback URL to `https://your-app.com/api/sms/webhooks/twilio` (or `/twilio-status` if you overrode `path`).

A handful of things that catch consumers out:

- The plugin only handles **status webhooks** (delivery receipts). Inbound SMS (someone texting *you*) is provider-specific and not in scope.
- `verifySignature: false` is for local dev only — at init, the plugin logs a loud warning if it's off.
- If you proxy through Cloudflare/Vercel/ngrok, set `trustProxy: true` on both the plugin and the adapter — Twilio's signature includes the full URL, so `X-Forwarded-Proto/Host` must be honored.
- Telnyx requires the Ed25519 public key from the portal (`webhook.publicKey`); without it the adapter doesn't register a webhook.
