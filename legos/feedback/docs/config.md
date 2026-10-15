# Feedback lego — config

`feedback-to-build-loop-001`. In-app feedback capture (FAB) + an admin triage/build
tab that drives the Nexus coding pipeline.

## Config (manifest `config_schema`)
- `enabled` (boolean, default `true`) — master switch for the FAB + admin tab.
- `allowed_types` (array, default `[bug, edit, idea]`) — categories offered in the composer.

## Env
- `DATABASE_URL` — the company's own Neon DB (the `feedback` table lives here).
- `RUNTIME_AUTH_TOKEN` — per-company token; the substrate uses it to call the
  portfolio-runtime, and the runtime uses it (Bearer) to authorize the
  `PATCH /api/feedback/:id` sync write-back. Symmetric.
- `CHAIRMAN_EMAILS` (optional) — admins allowed to approve HIGH-RISK Builds
  (auth/billing/data-model/infra). Defaults to `ADMIN_EMAILS`.

## Routes (substrate shims)
- `POST /api/feedback` — submit (any signed-in user)
- `GET  /api/feedback` — list (admin)
- `POST /api/feedback/:id/action` — Build / Revise / Discuss / Decline (admin)
- `POST /api/feedback/:id/answer` — answer the pipeline's clarifying question (admin)
- `PATCH /api/feedback/:id` — Nexus sync write-back (runtime-token gated)

## Events emitted (forwarded to portfolio-runtime)
- `feedback.submitted` — new item → triage
- `feedback.action` — Build/Revise/Discuss/Decline
- `feedback.answer` — clarifying-question answer

These subjects MUST be in the substrate `lib/runtime-events.ts` allow-list or they
are silently dropped.
