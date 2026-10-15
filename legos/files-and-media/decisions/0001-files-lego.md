# 0001 — Files & Media lego
## Context
files-and-media was a 16-LOC stub. §11 #10 + §12 (categorize/extract/flag tools).
## Decision
1. files + file_extractions. Storage itself (S3/blob) is substrate-provided;
   the lego tracks metadata + scan/quarantine status + extractions.
2. Three §12 read-only tools (categorize/extract/flag) + quarantine_file (confirm).
3. extract_structured_data persists via the file-extractions API (read-only tool
   computes; API writes) — consistent read-only-tool/write-via-API split.
## Consequences
Every portfolio company ships uploads + scan-status + the agent processing
uploads on arrival. quarantine_file rides the cross-boundary bridge.
