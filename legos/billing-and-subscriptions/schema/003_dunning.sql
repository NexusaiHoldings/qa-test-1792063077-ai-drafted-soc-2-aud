-- Billing & Subscriptions lego — dunning state (SS4.3)
-- Spec: NEXUS_PORTFOLIO_RUNTIME_SPEC §11 capability #4
-- Idempotent + forward-only.

-- Dunning state per subscription. One row per subscription that has
-- ever entered past_due. Driven by invoice.payment_failed events from
-- the webhook (see api/dunning.py for state-machine handler).
CREATE TABLE IF NOT EXISTS billing_dunning_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('healthy', 'at_risk', 'past_due', 'final_warning', 'cancelled')),
    failed_payment_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at TIMESTAMPTZ,
    last_failed_at TIMESTAMPTZ,
    last_retry_at TIMESTAMPTZ,
    next_action_at TIMESTAMPTZ,
    last_email_sent_at TIMESTAMPTZ,
    last_email_template TEXT,
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dunning_state ON billing_dunning_state(state, next_action_at)
  WHERE state IN ('at_risk', 'past_due', 'final_warning');
CREATE INDEX IF NOT EXISTS idx_dunning_unresolved ON billing_dunning_state(updated_at DESC)
  WHERE resolved_at IS NULL;
