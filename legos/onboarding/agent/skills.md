# Onboarding — Agent Skills

## recommend_onboarding_path
Recommend ordered onboarding steps for a new user from role + context. Read-only.
**Output:** `{ recommended_steps[], rationale }`

## detect_onboarding_dropoff
Score drop-off risk from progress + recency; return a nudge. Read-only.
**Output:** `{ at_risk, stalled_at, nudge }`

## suggest_next_onboarding_step
Pick the single best next step + prompt. Read-only.
**Output:** `{ next_step, prompt }`

## provision_sample_data
Seed demo data for first-run. GENUINE MUTATION — gated behind **confirm**
(the user opts in). **Output:** `{ run_id, status }`
