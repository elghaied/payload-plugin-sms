# Changelog

All notable changes to `@elghaied/payload-plugin-sms` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.4.1] — 2026-06-03

### Fixed

- **Broken published entrypoints in 0.4.0.** npm ≥ 11 no longer applies `publishConfig` field overrides (it warns `Unknown publishConfig config "exports"` and ignores them), so 0.4.0 shipped with `main`/`exports` still pointing at `./src/*.ts` — which isn't in the published tarball, breaking every import. The src→dist swap is now done explicitly by `prepack`/`postpack` scripts, independent of the npm version. (Functionally identical to the intended 0.4.0; 0.4.0 is deprecated.)

## [0.4.0] — 2026-06-03

### Added

- **Delivery-status callbacks now auto-wired.** When `webhooks: { enabled: true }`, the Twilio/Telnyx/Plivo adapters now receive a per-message delivery-status callback URL automatically — derived from `config.serverURL` + the webhook base path (e.g. `https://app.com/api/sms/webhooks/twilio`). No Messaging-Service / portal step needed for a plain sender. Override with `webhooks.statusCallbackUrl`. Localhost `serverURL` is skipped (dev). Vonage/AWS-SNS unchanged (no per-message callback). Note: the derived/override URL must match the URL the receiver reconstructs for signature verification — set `webhook.trustProxy: true` behind a reverse proxy, or use the override.
- **i18n (en/fr).** The `sms-logs` collection labels, field labels, status options, and the dashboard widget are now translated via a new `sms` translation namespace, deep-merged into `config.i18n.translations` (your translations win). Override any string or add languages via `i18n.translations.{lang}.sms.{key}`. New `@elghaied/payload-plugin-sms/translations` export.

## [0.3.0] — 2026-05-26

### Added

- **Delivery-status webhooks** for all five providers — Twilio, Telnyx, Plivo, Vonage, AWS SNS. Plugin auto-registers REST endpoints under `/api/sms/webhooks/<provider>` when `webhooks: { enabled: true }`.
- New `webhook` field on `SMSAdapter` exposing `{ verify, parse }`. Each provider adapter accepts a `webhook` option block carrying its signature secrets (Telnyx `publicKey`, Vonage `signatureSecret` + `signatureMethod`, etc.).
- `onStatus({ event, log, req })` plugin hook fires after the DB update.
- Optional `statusHistory` array on the `sms-logs` collection (opt-in via `collections.logs.statusHistory: true`) — appends every event regardless of rank for an audit trail.
- New fields on `sms-logs`: `deliveredAt`, `failedAt`, `errorCode`.
- `SMSWebhookVerificationError` — thrown by `verify`; mapped to HTTP 403 by the endpoint wrapper.
- `RoutedSMSAdapter.webhooks` — `routerAdapter` now aggregates each child's webhook into a `webhooks: Array<{ adapterName, handler }>` for multi-provider setups.

### Security

- AWS SNS: `SigningCertURL` and `SubscribeURL` hosts are both allow-listed against `sns.<region>.amazonaws.com` — closes an SSRF vector where an attacker-controlled `SubscribeURL` could trigger fetches of internal endpoints.
- Vonage: plain MD5 signing (`md5hash`) is rejected at adapter construction with a clear error — `sha256hash` or `sha512hash` only.
- Telnyx: Ed25519 verification rejects timestamps drifting more than 5 minutes from now (configurable via `maxDriftSec`).

### Behavior

- Status updates on `sms-logs` are **rank-gated**: `queued (0) < sent (1) < delivered (2)`, `failed (99)` terminal, `unknown (-1)` never overwrites. Out-of-order or duplicate webhooks drop silently and return 200.
- Webhook lookup filters by both `providerMessageId` AND `provider`, preventing cross-provider ID collisions.
- Missing log row → 200 + warn (returning 4xx would trigger infinite provider retries for events whose log predates the plugin).

### Roadmap

- Removed shipped item ("Delivery-status webhooks") from the README roadmap.

## [0.2.0] — 2026-05-26

### Added

- `routerAdapter` — composes multiple `SMSAdapter`s with a routing function and exposes a single `SMSAdapter` to the plugin.
- Route helpers: `byTenantLookup`, `byCountryPrefix`, `byRoundRobin`, `byRandom`.
- `withFailover(routeFn, fallbackOrder)` — wraps a route function to retry through a fallback chain on `SMSProviderError`.
- Optional `context: Record<string, unknown>` field on `SMSMessage` — propagated to `SMSResult.context` and (opt-in via `collections.logs.includeContext: true`) into a JSON column on the log row.
- Optional `init(payload)` lifecycle hook on `SMSAdapter` — `routerAdapter` uses this to propagate `init` to its children.

## [0.1.0] — 2026-05-26

### Added

- Initial release.
- Core plugin (`smsPlugin`) attaching `payload.sendSMS(message)` to the Payload instance via `onInit`.
- Adapters: Twilio, Telnyx, Plivo, Vonage (legacy SMS API), AWS SNS, mock.
- Optional `sms-logs` collection with status/cost/provider/sentAt fields (read-gated to authenticated users; admin can't create/update/delete).
- Optional dashboard widget showing recent SMS log rows.
- E.164 phone-number validation; `from` resolution via message → plugin config → adapter default.
- `onSend` / `onError` plugin hooks.
- `SMSValidationError` and `SMSProviderError`.
