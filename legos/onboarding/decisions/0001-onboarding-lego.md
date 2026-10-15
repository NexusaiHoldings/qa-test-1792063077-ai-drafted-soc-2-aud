# 0001 — Onboarding lego
## Context
onboarding was a 16-LOC stub. §11 #9: welcome flow, tour, checklist, sample data.
## Decision
1. onboarding_progress (per-step status) + onboarding_sample_data_runs.
2. Three read-only agent tools (recommend path / detect dropoff / suggest next)
   + provision_sample_data (confirm) — seeding data is opt-in.
## Consequences
Every portfolio company ships a first-run checklist + agent-driven onboarding
guidance + drop-off detection. provision_sample_data rides the cross-boundary
bridge.
