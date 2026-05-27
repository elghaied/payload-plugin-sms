# Debugging delivery and webhook problems

Symptom-first. Find the message that matches what the user is seeing and follow it.

## "SMSValidationError: Invalid 'to' phone number"

`sendSMS` requires E.164. Things that fail:
- `5551234567` — missing `+` and country code
- `+1 555 123 4567` — spaces / formatting
- `(555) 123-4567` — parens/hyphens
- `+155512345678901234` — too long (>15 digits)

Fix on the consumer side: normalize when the number is captured (a `beforeChange` hook on the phone field). `sendSMS` does not normalize — it validates and rejects.

## "SMSValidationError: No 'from' resolved"

Resolution order:
1. `message.from` (per-call)
2. `pluginConfig.defaultFrom` (smsPlugin config)
3. `adapter.defaultFrom` (adapter config)

If none resolve, the error throws *before* the adapter runs. **Twilio exception:** when `messagingServiceSid` is configured the adapter doesn't send a `from` parameter to the API — but `sendSMS` still requires *some* `from` value at the resolution stage. Set any phone number you own on `defaultFrom` even when using `messagingServiceSid`.

## "SMSValidationError: No SMS adapter configured"

The plugin was added but `adapter` was omitted from its config. Also throws if `disabled: true` is set. Check the user's `payload.config.ts` — the typical mistake is conditional adapter config that evaluates to `undefined` (e.g. `adapter: env.PROD ? twilioAdapter(...) : undefined`).

## "SMSProviderError: Install 'twilio' to use the Twilio adapter"

(And the equivalent for Telnyx, Plivo, Vonage, AWS SNS.)

The plugin's SDK peer dependencies are **optional** by design — adapters use dynamic `import()`. The user installed `@elghaied/payload-plugin-sms` but not the provider SDK. Fix: `pnpm add twilio` (or `telnyx` / `plivo` / `@vonage/server-sdk` / `@aws-sdk/client-sns`).

## "SMSProviderError: <Twilio/Telnyx/...> send failed: ..."

The provider rejected the send. Common causes:
- **Bad credentials.** Account SID / API key wrong. The provider error message usually says "Authentication Error" or "401".
- **Unverified destination number (Twilio trial accounts).** Trial accounts can only send to numbers verified in the console.
- **Blocked / suspended recipient.** Carrier-level filtering. Often returns success-then-fail via webhook.
- **From-number not enabled for SMS.** Toll-free numbers need verification; some shortcodes need provisioning.
- **Rate limit.** 429 from the API.

Inspect `err.cause` — it's the raw SDK error and usually carries the provider's full diagnostic.

## "payload-plugin-sms webhook: signature verification failed"

Logged as a warning; endpoint returns 403. Most common causes, in order:

1. **Wrong secret.** Pasted the wrong auth token / signing secret / public key into config. Each provider's UI shows it differently; some let you rotate.
2. **Body mutation by middleware.** Some hosting setups (or earlier middleware) parse JSON before the route handler — signature math runs against the *exact* bytes the provider sent. The plugin reads `rawBody` from the request stream — make sure nothing upstream consumed it.
3. **URL mismatch (Twilio).** Twilio signs the full URL. If your app sits behind a proxy and `trustProxy` is `false`, the URL the handler reconstructs (`https://internal-host:8080/api/...`) won't match the one Twilio signed (`https://your-app.com/api/...`). Set `webhooks.trustProxy: true` *and* the per-adapter `webhook.trustProxy: true`.
4. **Timestamp drift (Telnyx).** Server clock off by more than 5 minutes from real time. Fix NTP, or temporarily raise `webhook.maxDriftSec`.
5. **Header missing entirely.** Either the provider isn't sending the right header, or a proxy stripped it. Curl the endpoint to confirm what's arriving.

For local development you can set `webhooks.verifySignature: false` to skip verification — but the plugin logs a warning at init and this should never ship to production.

## "payload-plugin-sms webhook: no matching log row"

The webhook verified and parsed fine, but `applyStatusEvent` couldn't find a log to update. Means the lookup `find({ provider: adapterName, providerMessageId: event.providerMessageId })` returned nothing. Causes:

1. **Logs disabled.** `collections.logs` not enabled, so there's no row to find. Plugin warns at init.
2. **`provider` field mismatch.** The handler's `adapterName` (the key from `routerAdapter` or `adapter.name`) doesn't match what was written to the log when the send happened. Most often: someone renamed `adapter.name` between sending and the webhook arriving.
3. **`providerMessageId` mismatch.** `send` returned id `'SMabc123'`, webhook payload contains `'msg_SMabc123'` (or vice versa). Check the `String(...)` coercions on both sides; some SDKs prefix ids on receipt.
4. **Webhook arrived before the send returned.** Rare but possible — providers fire `queued`/`sent` events very quickly. Usually not a problem because the next webhook (`delivered`/`failed`) catches up. If you see this consistently, the send-side log write is failing — check the `payload-plugin-sms log write failed` warning.

If you have `statusHistory: true` on logs, the full event timeline is preserved — useful for piecing together what actually happened.

## Status stuck at `queued` / `sent`

Three checks:

1. **Webhook URL not registered with the provider portal.** The plugin only registers the *receiving* endpoint. The provider needs the public URL of `https://your-app.com/api/sms/webhooks/<adapter-name>` set as the status callback. Twilio sets this per-number; Telnyx per messaging-profile; etc.
2. **Webhook URL not reachable.** Behind a corp firewall, or running locally without a tunnel. Use ngrok / cloudflared / `payload dev --tunnel` for local testing.
3. **Webhook arriving but verification failing.** See "signature verification failed" above.

`statusHistory: true` is the fastest way to confirm webhooks are landing — if there are no entries, they aren't arriving (or are 403'ing). Check `payload.logger` output.

## Status updates "stuck" at lower rank

If `delivered` arrived first and then `queued` shows up later, the plugin **correctly** ignores the late `queued` — see `src/webhooks/rank.ts`. The rank ordering is:

```
queued(0) → sent(1) → delivered(2)     failed(99)     unknown(-1)
```

Only forward advances are written. `failed` is terminal — once a row is `failed`, nothing later overrides it. This is intentional.

## `payload.sendSMS is not a function`

Typescript can't see the augmentation. Make sure:
1. The package is imported somewhere (importing `smsPlugin` from the package's entry point pulls in `src/augment.ts` automatically — but tree-shakers can sometimes drop side-effect-only modules).
2. `tsconfig.json` has the right `moduleResolution` (NodeNext / Bundler).
3. The user is using the published types, not stale ones from `node_modules`.

If runtime works but only TS complains, the augmentation is being shaken out. A bare `import '@elghaied/payload-plugin-sms'` somewhere in the app config will pin it.

## Dashboard widget missing

The `SMSLogsWidget` only appears when:
- `collections.logs` is truthy (the collection exists), and
- `widgets !== false`, and
- `logs.slug` is the default `'sms-logs'`.

A custom slug silently disables the widget (and logs a warning if `widgets` was explicitly enabled). The widget hard-codes the slug — there's no way to point it at a different collection. Either use the default slug or set `widgets: false`.
