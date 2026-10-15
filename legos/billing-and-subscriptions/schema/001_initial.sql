-- Billing & Subscriptions lego — initial schema (SS4.1 foundation)
-- Spec authority: NEXUS_PORTFOLIO_RUNTIME_SPEC §11 capability #4
-- Idempotent + forward-only.

CREATE TABLE IF NOT EXISTS billing_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_user ON billing_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe ON billing_customers(stripe_customer_id);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_price_id TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'incomplete', 'incomplete_expired', 'unpaid')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_subs_customer ON billing_subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_subs_status ON billing_subscriptions(status, current_period_end DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subs_stripe ON billing_subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    stripe_price_id TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'complete', 'expired')) DEFAULT 'open',
    amount_cents INTEGER,
    currency TEXT,
    success_url TEXT,
    cancel_url TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkout_user ON billing_checkout_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_open ON billing_checkout_sessions(created_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_unprocessed ON billing_webhook_events(received_at DESC) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_type ON billing_webhook_events(event_type, received_at DESC);
