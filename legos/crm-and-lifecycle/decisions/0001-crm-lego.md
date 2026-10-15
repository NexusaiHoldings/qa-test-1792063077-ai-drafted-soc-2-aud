# 0001 — CRM & Lifecycle lego: agent-run pipeline

## Context

crm-and-lifecycle was a 16-LOC stub. Per §11 #15 + §12 it's a showcase for
the AI-as-Backbone reframe: the agent scores leads, drafts outreach,
summarizes history, and proposes next actions; the salesperson approves +
personalizes. Built in value order (crm → profile → orgs) after support.

## Decision

1. **Five agent tools.** score_lead / summarize_contact_history /
   propose_next_action / generate_outreach_draft are read-only (the agent
   computes; the runtime/UI applies). advance_contact_stage is the one genuine
   mutation (side_effects + confirm) — the salesperson approves pipeline moves
   so the agent never silently marks deals won/lost.

2. **Outreach is draft-then-approve, never auto-send.** generate_outreach_draft
   produces a draft stored in crm_outreach_drafts (status=draft); approval +
   send are separate steps gated by config.outreach.require_approval. The agent
   drafts; the human sends.

3. **score_lead applies via a dedicated API** (handleApplyScore) rather than the
   agent tool writing directly — keeps the read-only-tool / write-via-API split
   consistent (the tool computes the score; the API persists it + the hot flag).

4. **Self-contained model (crm_contacts/crm_interactions/crm_outreach_drafts).**
   No external CRM SaaS dependency; a HubSpot/Salesforce sync adapter can be a
   future config-gated option.

## Consequences

- Every portfolio company ships a working CRM: lead capture, a pipeline, a
  contact timeline, and an agent that scores + drafts + proposes.
- advance_contact_stage's runtime→company-app execution rides the
  cross-boundary mutation bridge (app-pull ledger) like other company-app
  mutations. The 4 read-only tools are fully live via the generic LLM handler.
- `depends_on: [identity-and-access, notifications]`.
