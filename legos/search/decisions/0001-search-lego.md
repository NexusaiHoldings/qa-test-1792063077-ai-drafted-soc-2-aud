# 0001 — Search lego
## Context
search was a 16-LOC stub. §11 #8: global cmd+K, facets, saved searches.
## Decision
1. Self-contained search_index (ILIKE candidate retrieval, no pgvector dep) +
   saved_searches. The agent's rank_search_results re-ranks candidates.
2. Three read-only agent tools (rank/refine/intent) — search is read-only, so
   no confirm-gated mutation tool.
## Consequences
Every portfolio company ships cmd+K search + saved searches + agent re-ranking.
