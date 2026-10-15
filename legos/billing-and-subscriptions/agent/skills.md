# Billing & Subscriptions — agent skills

## predict_churn_risk

Use this tool when you want to surface churn risk for a user — typically
in proactive admin alerts or in customer-success workflows. Inputs:
`user_id`. Output: `risk_score` (0-100) plus a list of contributing
`indicators` (e.g., "trial ended without conversion", "payment failed
twice in 30d", "no logins in 14d", "downgrade requested in support
chat").

Read-only — does not change subscription state. Safe to call frequently
within rate limit.

## summarize_invoice_for_customer

Use this tool when a customer asks "what am I being charged for" or
when generating a customer-facing email body that includes invoice
details. Inputs: `stripe_invoice_id`. Output: `plain_summary` (one
paragraph), `line_items` (array of name/amount/proration), `total_cents`.

Read-only. Useful for chat support and dunning emails.

## recommend_tier_change

Use this tool when proactively suggesting a tier change to a user who
is consistently above or below their current tier's typical-use
envelope. Inputs: `user_id`, optional `usage_window_days` (default 30).
Output: `recommendation` enum, `recommended_tier`, `reasoning` (one
paragraph suitable for user-facing surface).

Action class is `notify` — surfaces a suggestion to the user but does
NOT auto-change their tier. The actual upgrade/downgrade requires a
separate user-confirmed flow (deferred to SS4.2 customer portal +
plan-change endpoints).
