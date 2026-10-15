# Search — Agent Skills

## rank_search_results
Re-rank candidate results by relevance to query + intent. Read-only.
**Output:** `{ ranked[] }`

## suggest_search_refinement
Suggest refined queries / facets for low-result searches. Read-only.
**Output:** `{ suggestions[] }`

## summarize_search_intent
Classify intent (navigational/informational/transactional) + entities. Read-only.
**Output:** `{ intent, entities[] }`
