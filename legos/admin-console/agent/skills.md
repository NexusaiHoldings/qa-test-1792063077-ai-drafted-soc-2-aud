# Admin Console Agent Skills

## summarize_admin_activity

Use when an operator asks "what's been happening in the admin console?" or wants
a digest of recent changes. Accepts an optional admin_user_id to scope the
summary to a single administrator.

Good triggers:
- "Show me what changed in the last 24 hours"
- "What did admin X do this week?"
- "Give me an admin activity report"

Output surfaces: admin dashboard widget, Slack digest, weekly report email.

## recommend_feature_flag_rollout

Use when an operator is deciding whether to increase, hold, or roll back a feature
flag. The agent consumes the flag's current rollout_percent plus caller-provided
success metrics (error rate, conversion rate, p99 latency, etc.) and returns a
recommendation with reasoning.

Good triggers:
- "Should I increase the rollout for flag X?"
- "Our error rate went up after enabling Y — what do you recommend?"
- "Flag Z is at 50% — is it safe to go to 100%?"

The agent recommends only; the operator executes the PATCH via the feature flags
API. action_class=notify means no autonomous writes occur.

## detect_anomalous_admin_action

Use proactively on each admin action or on a scheduled sweep of the audit log.
Returns a risk_score so the operator can triage; never takes autonomous action.

Good triggers:
- Scheduled: sweep audit log every hour for anomalies
- Event-driven: check every time admin_audit_log receives a new entry
- Manual: "Is there anything suspicious in admin activity this week?"

High risk_score (> 0.7) warrants an operator notification. Indicators like
"bulk_deletion", "off_hours_config_change", or "rapid_flag_toggle" are surfaced
for human review. action_class=notify ensures the agent never autonomously locks
out or reverts an admin action.
