-- Notifications lego — initial schema (SS6)
-- Spec: NEXUS_PORTFOLIO_RUNTIME_SPEC §11 capability #6
-- Idempotent + forward-only.

-- Per-user channel preferences. One row per (user_id, channel).
-- Defaults populated from manifest.config_schema.default_channels at user creation.
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app', 'web_push', 'sms')),
    category TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, channel, category)
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);

-- Audit log of every dispatched notification. One row per (user, channel)
-- attempt; if a single notification fans out to email + in_app + push, that's
-- 3 rows.
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    template_name TEXT NOT NULL,
    category TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app', 'web_push', 'sms')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'dispatched', 'delivered', 'failed', 'opened', 'clicked', 'skipped')),
    provider_message_id TEXT,
    failure_reason TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_log_user ON notification_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_template ON notification_log(template_name, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_unread ON notification_log(user_id, created_at DESC)
  WHERE channel = 'in_app' AND opened_at IS NULL;

-- Web Push subscription endpoints. One row per browser/device.
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_web_push_user ON web_push_subscriptions(user_id);
