# Profile & Account — Agent Skills

Each H2 corresponds to a tool in tools.yaml.

## suggest_profile_completion
Identify missing/weak profile fields + suggest concrete completions. Returns a
completion score + prioritized suggestions. Read-only.
**Output:** `{ completion_score, suggestions[] }`

## detect_stale_account
Score account staleness from last-active recency + completeness + connected
count; return a re-engagement nudge. Read-only.
**Output:** `{ is_stale, staleness_score, nudge }`

## summarize_connected_accounts
Summarize connected providers + flag security observations (single provider →
suggest backup; stale link → suggest disconnect). Read-only.
**Output:** `{ summary, observations[] }`

## request_account_export
Create a GDPR data-export request. GENUINE MUTATION (starts an export job
exposing user data) — gated behind **confirm**; the user authorizes the export.
**Output:** `{ export_id, status }`
