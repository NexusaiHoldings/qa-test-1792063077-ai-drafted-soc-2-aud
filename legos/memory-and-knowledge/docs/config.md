# Memory & Knowledge — Config Reference

## Required

### `working_memory_ttl_days` (integer, 1–90, default 7)
TTL for working-tier memories. Spec §5.6 mandates `7d_idle`. Override per
portfolio company if workflows routinely span longer windows.

### `long_term_eviction_no_retrieval_days` (integer, 30–365, default 90)
Threshold below which long-term memories are flagged as low-utility eviction
candidates. The eviction endpoint (`/api/memory/evict-low-utility`) reads
this value via `app.memory_config`.

## Optional

### `contradiction_threshold` (integer, 1–10, default 3)
Number of contradictions before a long-term memory is auto-demoted. Lower
values = more aggressive demotion; higher values = stickier memories.

### `knowledge_compiler_debounce_seconds` (integer, 30–3600, default 300)
Minimum seconds between compiler runs per portfolio company. Force-bypass
via `force=true` on the compile endpoint.

## Environment

- `DATABASE_URL` — required (Postgres connection for memory_items, portfolio_runtime_memory, etc.)
- `REDIS_URL` — optional (working-tier read-through cache; falls back to Postgres)

## Per-company overrides

The lego reads config via `app.memory_config` which the runtime hydrates
from the per-portfolio-company config row at install time (per spec §4.5
admin contribution contract). Edit via `/admin/memory` → "Configuration"
section after installing the lego.
