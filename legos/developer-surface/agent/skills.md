# Developer Surface — Agent Skills

## summarize_api_usage
Summarize volume / top endpoints / error rate + health verdict. Read-only.
**Output:** `{ summary, error_rate, top_endpoints[] }`

## detect_anomalous_api_traffic
Flag spikes / scraping / auth-failure patterns + risk. Read-only.
**Output:** `{ anomalies[], risk_level }`

## recommend_rate_limit
Recommend a per-key RPM from observed usage. Read-only.
**Output:** `{ recommended_rpm, rationale }`

## revoke_api_key
Revoke a key. GENUINE MUTATION — gated behind **confirm** (e.g. after a leak).
**Output:** `{ api_key_id, status }`
