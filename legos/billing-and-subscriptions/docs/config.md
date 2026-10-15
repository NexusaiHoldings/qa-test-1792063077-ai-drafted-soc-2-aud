# Billing & Subscriptions — Config Reference

Configured via the lego's manifest `config_schema` block at install time. All values are JSON Schema-validated; required fields fail loudly.

## Required

### `stripe_publishable_key` (string)
Stripe publishable key (`pk_live_...` or `pk_test_...`). The secret key is NEVER stored in config — read from environment variable `STRIPE_SECRET_KEY` instead. Same for `STRIPE_WEBHOOK_SECRET`.

### `default_currency` (enum)
One of `usd`, `eur`, `gbp`, `cad`, `aud`. New subscriptions are created in this currency unless overridden per-tier.

### `tier_ladder` (array)
Pricing tiers exposed in checkout. Each entry:

```yaml
- name: "starter"
  price_id: "price_1AbCdE..."   # Stripe Price ID
  amount: 1400                   # Cents
  interval: "month"              # month | year
```

The chairman's standard ladder is `$14 / $24 / $59 / $99` per month — define one tier per price-point. The `name` field is exposed to the agent layer for `recommend_tier_change` reasoning.

## Optional

### `trial_days` (integer, default 0, max 90)
Free-trial period for new subscriptions. Stripe's `subscription_data[trial_period_days]` is set to this value at checkout time.

### `enable_proration` (boolean, default true)
Pro-rate plan changes mid-cycle. When false, plan changes apply at the next period start (no immediate charge or credit).

## Environment variables

These are required at runtime (not stored in config):

- `STRIPE_SECRET_KEY` — secret API key (`sk_live_...` or `sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_...`)
- `STRIPE_API_VERSION` — optional, defaults to `2024-06-20`
- `DATABASE_URL` — Postgres connection string

## Validation

Config is validated at install time against the manifest's `config_schema` (JSON Schema 2020-12). Failed validation = lego fails to install + chairman sees the error in admin console.
