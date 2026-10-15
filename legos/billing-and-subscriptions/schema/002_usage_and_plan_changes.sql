-- Billing & Subscriptions lego — usage metering + plan-change history (SS4.2)
-- Spec: NEXUS_PORTFOLIO_RUNTIME_SPEC §11 capability #4.
-- Idempotent + forward-only.

-- Per-(subscription, meter) usage events. Each row is a single recorded
-- usage event; aggregation happens at query time + at the period roll
-- when we report to Stripe via the metered-billing API.
CREATE TABLE IF NOT EXISTS billing_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    meter_name TEXT NOT NULL,
    quantity NUMERIC(20, 6) NOT NULL CHECK (quantity >= 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    reported_to_stripe_at TIMESTAMPTZ,
    UNIQUE (subscription_id, meter_name, idempotency_key) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_usage_events_sub_meter
  ON billing_usage_events(subscription_id, meter_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_unreported
  ON billing_usage_events(occurred_at) WHERE reported_to_stripe_at IS NULL;

-- Per-(subscription, meter) period totals. Recomputed nightly + on read;
-- denormalized for fast customer-portal display.
CREATE TABLE IF NOT EXISTS billing_usage_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    meter_name TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
    last_event_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, meter_name, period_start)
);
CREATE INDEX IF NOT EXISTS idx_usage_summaries_sub
  ON billing_usage_summaries(subscription_id, period_end DESC);

-- Plan change history — every upgrade/downgrade is an audit row.
-- Distinct from billing_subscriptions (which is current state).
CREATE TABLE IF NOT EXISTS billing_plan_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    from_tier_name TEXT NOT NULL,
    to_tier_name TEXT NOT NULL,
    from_price_id TEXT NOT NULL,
    to_price_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'lateral')),
    proration_amount_cents INTEGER,
    initiated_by UUID,
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_changes_sub
  ON billing_plan_changes(subscription_id, initiated_at DESC);
