# Notifications — agent skills

## predict_send_time

Use this tool when scheduling a non-urgent notification (re-engagement
campaign, weekly digest) and you want to pick the highest-engagement
window for the user. Inputs: `user_id`, `category`. Returns a target
`recommended_send_at` ISO timestamp + `confidence` (0-1) + `reasoning`.

Read-only. Safe at full agent autonomy.

## detect_engagement_decay

Use this tool when reviewing notification effectiveness — detects users
whose open/click rates have dropped meaningfully from their historical
baseline. Inputs: `user_id`, optional `window_days` (default 30).
Output: `decay_detected` bool, prior + recent rates, plus a
`recommendation` (e.g., "pause non-essential category for 14d", "send
re-engagement template").

Read-only.

## rewrite_for_tone

Use this tool when adjusting a notification draft to match a portfolio
company's tone preferences. Inputs: `original_text`, `target_tone`
enum (formal / friendly / urgent / neutral). Output: `rewritten_text`.

`notify` action class — surfaces the rewrite as a suggestion; does NOT
auto-apply. Caller (or the portfolio company's editor UI) decides
whether to accept.
