# CRM & Lifecycle — Agent Skills

Per spec §12 the agent runs the pipeline; the salesperson approves + personalizes.
Each H2 corresponds to a tool in tools.yaml.

## score_lead

Score a lead 0–100 on likelihood-to-convert from its attributes + interaction
history. Returns `score`, `tier` (cold/warm/hot), and top `signals`. Read-only.

**When to use:** every new lead (on lead.captured) + after significant new
interactions. Score ≥ the company's hot_lead_threshold flags the lead hot.

**Output shape:** `{ score, tier, signals[] }`

## summarize_contact_history

Summarize a contact's history into a brief: where the relationship stands,
what's discussed, outstanding items. Read-only.

**Output shape:** `{ summary, last_touch, outstanding_items[] }`

## propose_next_action

Given a contact + history + stage, propose the single best next action +
rationale + suggested stage + urgency. Read-only recommendation surfaced in
the contact sidebar.

**Output shape:** `{ action, rationale, suggested_stage, urgency }`

## generate_outreach_draft

Draft a personalized outreach message for a contact toward a goal. Read-only —
the draft is STORED pending salesperson approval; sending is a separate action.
Keep it concise, personalized to the contact's history, never spammy.

**Output shape:** `{ subject, body, confidence }`

## advance_contact_stage

Move a contact to a new pipeline stage + log a stage_change. GENUINE MUTATION
of the company CRM — gated behind **confirm** (salesperson approves). Use when
a stage transition is clearly warranted (e.g. proposal sent → 'proposal',
deal closed → 'won'). Never silently mark deals won/lost.

**Output shape:** `{ contact_id, stage }`
