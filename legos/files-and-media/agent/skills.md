# Files & Media — Agent Skills

## categorize_uploaded_file
Categorize an upload from filename + mime + sample. Read-only.
**Output:** `{ category, confidence }`

## extract_structured_data
Extract structured fields from a doc/CSV sample into JSON. Read-only; persisted
via the file-extractions API. **Output:** `{ extracted, confidence }`

## flag_anomaly_in_dataset
Scan a dataset sample for outliers / malformed rows / PII. Read-only.
**Output:** `{ anomalies[], risk_level }`

## quarantine_file
Block access to an infected/suspicious file. GENUINE MUTATION — gated behind
**confirm** (operator approves). **Output:** `{ file_id, status }`
