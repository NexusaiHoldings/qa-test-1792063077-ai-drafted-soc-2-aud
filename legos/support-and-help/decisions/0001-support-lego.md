# 0001 — Support & Help lego: AI-as-backbone first-line support

## Context

support-and-help was a 16-LOC stub. Per NEXUS_PORTFOLIO_RUNTIME_SPEC §11 #7 +
§12, it's the flagship for the AI-as-Backbone reframe: the agent runs
first-line support (triage, KB-grounded deflection, draft replies, escalation)
while the human operator supervises the queue. It's the first stub built out
after the runtime tool-wiring + 6-lego hardening track.

## Decision

1. **Five agent tools** (`agent/tools.yaml`): `triage_incoming_ticket`,
   `suggest_kb_article`, `draft_response`, `summarize_ticket_thread` are
   read-only (side_effects=false) — they execute via the runtime's generic
   LLM handler. `escalate_to_human` is the one genuine mutation
   (side_effects + `action_class: confirm`) — it routes through the runtime
   approval queue and only mutates post-confirm.

2. **AI deflection is config-gated, not hardcoded.** `deflection.min_kb_confidence`
   decides when the agent answers from the KB vs opens a ticket. The agent
   never silently abandons — low confidence opens a ticket; high priority
   escalates.

3. **The server-side mutation for escalate lives in `api/tickets.ts`
   (`handleEscalateTicket`), not in the agent tool.** The agent tool is the
   decision ("escalate this, here's why"); the API route is the effect. The
   runtime, on approval, calls the company app's escalate endpoint. This keeps
   the destructive write inside the company's own app + DB, not the shared
   runtime.

4. **No Chatwoot dependency.** Spec §11 mentioned Chatwoot for ticketing; we
   ship a self-contained ticketing model (support_tickets + support_messages)
   so the lego has no external SaaS dependency. A Chatwoot adapter can be a
   future config-gated option.

5. **KB search is ILIKE-based, no pgvector.** `handleSearchArticles` returns
   candidate rows; `suggest_kb_article` does the semantic relevance scoring on
   top. Keeps the lego substrate-portable (no pgvector requirement).

## Consequences

- Every portfolio company now ships real support: an in-app widget, a ticket
  queue, a KB, and an agent that triages + drafts + escalates.
- `escalate_to_human`'s runtime-side handler (calling the company app's
  escalate API across the runtime↔app boundary) is NOT yet built — the tool
  declares + defers correctly, but the cross-boundary execution handler is a
  follow-up (same gap class as any company-app-mutating tool). The 4 read-only
  tools are fully live.
- `depends_on: [identity-and-access, notifications]` — tickets attribute to a
  user; resolution triggers CSAT email via notifications.
