# Analytics & Telemetry — Agent Skills

## summarize_funnel_performance
Summarize funnel conversion + biggest drop-off + verdict. Read-only.
**Output:** `{ summary, biggest_dropoff, overall_conversion }`

## detect_metric_anomaly
Flag spike/drop in a metric series + cause hypotheses. Read-only.
**Output:** `{ anomaly_detected, direction, hypotheses[] }`

## recommend_event_to_track
Recommend events to instrument for a goal. Read-only.
**Output:** `{ recommended_events[], rationale }`

## explain_retention_drop
Hypothesize causes of a retention drop + investigations. Read-only.
**Output:** `{ hypotheses[], investigations[] }`
