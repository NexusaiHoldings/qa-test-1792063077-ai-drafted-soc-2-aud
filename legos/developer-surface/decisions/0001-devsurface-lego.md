# 0001 — Developer Surface lego
## Context
developer-surface was a 16-LOC stub. §11 #12: API keys, webhooks, rate limit.
## Decision
1. api_keys (hash + prefix, never plaintext) + webhooks + api_request_log.
2. Three read-only agent tools (summarize usage / detect anomaly / recommend
   rate limit) + revoke_api_key (confirm).
3. Key material is hashed by the caller; the lego stores key_hash + prefix only.
## Consequences
Portfolio products with an API ship key management + webhooks + agent traffic
monitoring. revoke_api_key rides the cross-boundary bridge.
