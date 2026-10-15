# Memory & Knowledge — Agent Skills

The memory-and-knowledge lego is consumed by every other lego's runtime
agent. The agent should:

## 1. Recall before acting
Before composing a response or executing a tool, call `recall_relevant_memories`
filtered by the discipline the current task lives in. If 0 memories return,
proceed without context (don't hallucinate prior patterns).

## 2. Reflect after acting
At the end of each workflow turn, the reflection module decides whether the
turn produced a durable pattern. Durable means:
- The same approach has now succeeded ≥3 times for this company, OR
- The chairman / admin explicitly tagged the pattern as canonical.

When a durable pattern is identified, call `store_durable_pattern` with the
working_memory_id of the source row. That row is moved to long_term and
the working row is removed.

## 3. Honor the forget contract
`forget_user` is destructive. The agent should:
- Confirm the user's identity before initiating
- Surface the deletion count to the user (transparency)
- Write a follow-up notification confirming deletion (per Notifications lego)

## 4. Tier routing rules
- **short_term** (in-context only): the current conversation. Don't write here — it lives in your context window.
- **working**: per-workflow state with 7d_idle TTL. Write `pending_approval`, `planned_action`, `tool_call_history`.
- **long_term**: per-company persistent. Only the reflection module writes here.
- **shared**: cross-company. Only the Nexus knowledge compiler writes here. Portfolio agents NEVER write to shared directly.

## 5. Demotion signals
If a recall returns a memory that contradicts current evidence, call
`record_contradiction` (POST /api/memory/contradict) on that memory id.
Three contradictions → automatic demotion (status='demoted', excluded from
future recalls but retained for replayability).

## 6. Privacy primitives
- Always pass `portfolio_user_id` when the memory is attributable to one user
- Treat memory rows without `portfolio_user_id` as company-shared (visible to all admin operators)
- Never write PII to `payload` without explicit consent — payload is queryable in stats

## Cost guidance
All memory tools are deterministic (no LLM cost). The compute cost is database
I/O only. Use freely; don't ration recalls.
