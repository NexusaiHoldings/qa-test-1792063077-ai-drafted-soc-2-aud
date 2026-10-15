# Support & Help — Agent Skills

Natural-language descriptions of agent tools for the runtime to load when
building the agent's context. Each H2 corresponds to a tool in tools.yaml.
Per spec §12, the agent runs first-line support; the operator supervises.

## triage_incoming_ticket

Use this as the FIRST step when a new ticket arrives. Pass the `subject` and
`body` (and `user_context` when available — plan tier, account age, prior
ticket count).

Returns a `category`, a `priority` (low/normal/high/urgent), a one-line
`rationale`, and a `sentiment`. No approval required — it only classifies.

**When to use:** every new ticket, before drafting or deflecting. High/urgent
priority or `angry` sentiment should bias toward `escalate_to_human`.

**Output shape:** `{ category, priority, rationale, sentiment }`

## suggest_kb_article

Use to find relevant published KB articles for a user question. Pass the
`question` and an optional `limit` (default 3).

Returns ranked `articles` with a `relevance` (0–1) and the `top_relevance`.
This powers AI deflection: when `top_relevance` ≥ the company's
`min_kb_confidence`, answer from the KB (via `draft_response` citing the
article) instead of opening a ticket.

**Output shape:** `{ articles: [{article_id, title, relevance}], top_relevance }`

## draft_response

Use to draft a customer-facing reply. Pass the `ticket_subject`, the ordered
`thread`, and optional `kb_context` (article bodies to ground the answer).

Returns a `draft`, a `confidence` (0–1), and `cites_kb`. The draft is for
operator review or for the runtime to send via a separate send action —
drafting never contacts the customer by itself.

**When to use:** after triage, once you have enough context to answer. Keep it
concise, on-brand, and honest about what you cannot do from support alone.

**Output shape:** `{ draft, confidence, cites_kb }`

## summarize_ticket_thread

Use to produce a concise operator-facing summary of a ticket: the issue, what's
been tried, and the current blocker. Pass the ordered `thread`.

**When to use:** when escalating, or when the operator opens a long thread.

**Output shape:** `{ summary, open_question }`

## escalate_to_human

Use when you cannot resolve a ticket — high/urgent priority, angry sentiment,
a request requiring access or judgment you don't have, or repeated failed
resolution attempts. Pass the `ticket_id`, a clear `reason`, and an optional
`priority_override`.

This is a GENUINE STATE MUTATION (flips the ticket to the human queue, sets
`escalated_at`, records an internal note) and is gated behind **confirm** — the
operator approves the hand-off. Escalate rather than silently abandoning a
ticket you can't solve.

**Output shape:** `{ ticket_id, escalated, assignee_type }`
