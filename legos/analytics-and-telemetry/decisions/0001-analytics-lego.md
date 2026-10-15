# 0001 — Analytics & Telemetry lego
## Context
analytics-and-telemetry was a 16-LOC stub. §11 #13: events, funnels, retention.
## Decision
1. analytics_events (name + properties + user) + analytics_funnels. Self-contained
   (a PostHog/Segment sync adapter can be a future config-gated option).
2. FOUR read-only agent tools (summarize funnel / detect anomaly / recommend
   event / explain retention) — analytics is observe-only, so NO confirm
   mutation tool.
## Consequences
Every portfolio company ships event tracking + funnels + an agent that reads
metrics, flags anomalies, and explains retention drops.
