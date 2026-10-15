# Identity & Access — Agent Skills

Natural-language descriptions of agent tools for the runtime to load when
building the agent's context. Each H2 corresponds to a tool in tools.yaml.

## detect_suspicious_login

Use this tool immediately after a user logs in to evaluate whether the login
event looks suspicious. Pass the `user_id`, `ip_address`, and `user_agent`
from the login request.

The tool returns a `risk_score` (0.0–1.0) and a list of `flags` explaining
the risk factors (e.g. `new_country`, `impossible_travel`, `tor_exit_node`).

**When to use:** Evaluate every login. No approval required. If `risk_score`
is above 0.7, surface a notification to the user about the unusual activity.
If above 0.9, consider requesting reauthentication via `analyze_session_risk`.

**Output shape:** `{ risk_score: float, flags: string[] }`

## analyze_session_risk

Use this tool to periodically evaluate the risk level of an active session.
Pass the `session_id`. The tool returns a `risk_score` and a list of
`recommendations` (e.g. `prompt_reauthentication`, `force_logout`).

**When to use:** Call when a session has been active for more than 24 hours,
when the session's IP address has changed, or when the account has had recent
failed login attempts. No approval required to call this tool.

**Important:** If `force_logout` appears in recommendations, surface this to
the operator — do not act autonomously. Operator confirmation is required
before invalidating an active session.

**Output shape:** `{ risk_score: float, recommendations: string[] }`

## suggest_passkey_upgrade

Use this tool to decide whether to show a user the passkey (WebAuthn) upgrade
prompt. The tool evaluates account age, login frequency, device WebAuthn
support (via user-agent hints), and recent suspicious login history.

**When to use:** Call after a successful login when the user has not been
prompted for a passkey upgrade in the past 90 days. No approval required —
this tool only returns a boolean and reasoning; the actual UI prompt is
rendered by the frontend via the `after_login_redirect` slot.

**Output shape:** `{ should_suggest: boolean, reasoning: string }`

If `should_suggest` is `true`, signal the frontend to show the passkey
onboarding flow. Log the reasoning for audit purposes.

## score_password_strength

Use this tool to evaluate the strength of a candidate password before
accepting it. Pass the `password` string. The tool returns a `score`
(0–100) and a `weak_areas` list explaining any deficiencies
(e.g. `too_short`, `no_symbols`, `common_pattern`).

**When to use:** Call during password creation (signup, reset, change) to
give the user real-time feedback. No approval required; this is a
read-only analysis with no side effects.

**Output shape:** `{ score: int, weak_areas: string[] }`

## detect_credential_stuffing

Use this tool when login failures from a given IP address or user account
exceed a threshold that may indicate automated credential stuffing.
Pass the `ip_address`, `user_id`, and `recent_failures` count (past hour).

The tool returns a `risk_score` (0.0–1.0) and `flags` such as
`high_failure_rate` or `distributed_ips`. If `risk_score` is above 0.8,
notify the operator and consider temporary IP-level throttling.

**When to use:** Evaluate after any 5th consecutive failed login from the
same IP within one hour. No approval required.

**Output shape:** `{ risk_score: float, flags: string[] }`

## recommend_mfa_method

Use this tool to recommend the best second-factor method for a user about
to enroll MFA. Pass the `user_id` and a `device_capabilities` array
(e.g. `["webauthn", "totp_app"]`).

The tool returns the `recommended_method` (`totp`, `sms`, or `passkey`)
and a `reasoning` string explaining the choice.

**When to use:** Call when a user opens the MFA enrollment flow before
presenting the list of available methods. No approval required; the
recommendation is advisory only.

**Output shape:** `{ recommended_method: string, reasoning: string }`

## recommend_session_revocation

Use this tool when an admin is reviewing a user's active sessions and needs
guidance on which ones may be suspicious. Pass the `user_id` and the list of
active `sessions` (id, ip_address, created_at).

The tool returns `recommended_revocations` (list of session ids) and `reasoning`.

**When to use:** When an admin opens the user-detail page and wants a risk-ranked
recommendation before bulk-revoking. **Requires admin approval before acting**
(action_class: confirm). Do not call the revoke endpoints without operator sign-off.

**Output shape:** `{ recommended_revocations: uuid[], reasoning: string }`

## detect_account_takeover

Use this tool when an account shows unusual patterns: rapid provider changes,
unexpected OAuth login from a new provider, many sessions created in a short window.
Pass `user_id`, `recent_login_history`, and `recent_session_changes`.

Returns `risk_score` (0–1) and `indicators` list (e.g. `new_oauth_provider`,
`mass_session_create`, `impossible_travel`). If `risk_score` >= 0.8, notify the
user immediately and surface to admin. No approval required to call this tool.

**Output shape:** `{ risk_score: float, indicators: string[] }`

## score_account_deletion_risk

Use this tool when a user requests account deletion to determine the appropriate
handling path. Pass `user_id`, `account_age` (days), `paid_status`, and
`support_history`.

Returns `risk_score` and `recommended_path`: `honor` (proceed), `verify`
(request additional identity confirmation), or `escalate` (manual review
for active subscriptions / chargebacks / support disputes).

**When to use:** Immediately when `user.deletion_requested` fires, before
any data removal occurs. No approval required — advisory only; deletion
proceeds on the configured grace period regardless.

**Output shape:** `{ risk_score: float, recommended_path: string }`
