# Notifications — Config Reference

## Required

### `resend_from_email` (string)
Verified sender for Resend. Format: `notifications@yourdomain.com`. Domain must be verified in Resend dashboard.

### `default_channels` (array of enum)
Channels enabled by default for new users. Subset of `[email, in_app, web_push, sms]`. Per-user opt-outs are stored in `notification_preferences`.

## Optional

### `twilio_messaging_service_sid` (string)
Required if `sms` is in `default_channels`. Twilio Messaging Service SID for SMS dispatch.

### `web_push_vapid_public_key` (string)
Required if `web_push` is in `default_channels`. VAPID public key for browser push subscriptions. Private key is read from env `WEB_PUSH_VAPID_PRIVATE_KEY`.

### `rate_limit_per_user_per_hour` (integer, default 30)
Per-user dispatch rate limit. Tier1-locked Resend already enforces account-level limits; this protects per-user spam scenarios.

## Environment

- `RESEND_API_KEY` — required
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` — required if SMS enabled
- `WEB_PUSH_VAPID_PRIVATE_KEY` — required if web_push enabled
- `DATABASE_URL` — required
