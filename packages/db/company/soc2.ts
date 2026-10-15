/**
 * SOC 2 domain schema (F1-002 — Cloud & Code Connector Registry).
 *
 * Company-owned tables for the read-only cloud/code connector registry that
 * powers /connections. Every row is organization_id-scoped (tenant isolation
 * via @nexus/organizations-and-teams). Credentials are NEVER stored in plain
 * text — the vault (apps/web/lib/soc2/vault.ts) envelope-encrypts them and the
 * ciphertext/wrapped-key material lands in soc2_credentials.
 *
 * Picked up by packages/db/migrate.ts via the *_DDL constant convention
 * (the constant name ends in `_DDL`), so these run against the company DB at
 * build/deploy time. Idempotent (CREATE TABLE/INDEX IF NOT EXISTS).
 *
 * NOTE: no CHECK constraints on free-form text columns (per task constraints);
 * provider/status are validated in application code (apps/web/lib/soc2/*).
 */
export const SOC2_DDL = `
CREATE TABLE IF NOT EXISTS soc2_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  provider           text NOT NULL,
  status             text NOT NULL DEFAULT 'not_connected',
  display_name       text,
  external_id        text,
  installation_id    text,
  account_login      text,
  scope_description  text,
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code       text,
  failure_hint       text,
  last_sync_at       timestamptz,
  connected_at       timestamptz,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_soc2_connections_org
  ON soc2_connections (organization_id, provider);
CREATE INDEX IF NOT EXISTS idx_soc2_connections_installation
  ON soc2_connections (installation_id)
  WHERE installation_id IS NOT NULL;

-- Envelope-encrypted credential material. One active row per connection; the
-- plaintext secret is never persisted. A random data-encryption key (DEK)
-- encrypts the secret (AES-256-GCM); the DEK itself is wrapped by the master
-- key-encryption key (AES-256-GCM). Zero-retention: rotate by deleting rows.
CREATE TABLE IF NOT EXISTS soc2_credentials (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    uuid NOT NULL,
  organization_id  uuid NOT NULL,
  provider         text NOT NULL,
  ciphertext       text NOT NULL,
  iv               text NOT NULL,
  auth_tag         text NOT NULL,
  wrapped_dek      text NOT NULL,
  dek_iv           text NOT NULL,
  dek_auth_tag     text NOT NULL,
  key_id           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_credentials_connection
  ON soc2_credentials (connection_id, created_at DESC);

-- Append-only connection lifecycle log (connect / disconnect / sync / failure).
-- Mirrors the admin-console audit for the SOC 2 domain's own timeline views.
CREATE TABLE IF NOT EXISTS soc2_connection_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id    uuid,
  organization_id  uuid NOT NULL,
  provider         text NOT NULL,
  event_type       text NOT NULL,
  actor_user_id    uuid,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_connection_events_org
  ON soc2_connection_events (organization_id, created_at DESC);
`;

/**
 * SOC 2 Trust Services Criteria control library + evidence mapping (F1-005).
 *
 * `soc2_controls` is the embedded AICPA SOC 2 (2017, 2022 points of focus)
 * knowledge base — Common Criteria CC1.1–CC9.2 plus Availability A1 and
 * Confidentiality C1. It is GLOBAL reference data (not organization-scoped):
 * the criteria are identical for every tenant. apps/web/lib/soc2/tsc/seed.ts
 * upserts the catalog here (ON CONFLICT (code)) at deploy/first-run.
 *
 * `soc2_evidence_artifacts` holds the ingested, read-only infrastructure state
 * (CloudTrail config, IAM password policy, GitHub branch protection, …) — one
 * row per collected artifact, organization_id-scoped.
 *
 * `soc2_control_evidence` is the OUTPUT of apps/web/lib/soc2/mapper.ts: the
 * deterministic-rule-first / LLM-fallback mapping of artifacts to criteria.
 * Status is always one of evidence_found | gap | needs_human_review |
 * not_applicable_claimed — NEVER 'compliant' (the agent flags, it does not
 * certify). A row with status 'evidence_found' ALWAYS carries a non-null
 * artifact_id: no artifact citation, no evidence_found (hallucination guard).
 *
 * No CHECK constraints on free-form text columns (per task constraints);
 * status/method vocabularies are enforced in application code.
 */
export const SOC2_CONTROLS_DDL = `
CREATE TABLE IF NOT EXISTS soc2_controls (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE,
  category           text NOT NULL,
  category_label     text NOT NULL,
  title              text NOT NULL,
  criteria_text      text NOT NULL,
  points_of_focus    jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_document    text NOT NULL,
  artifact_types     jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_controls_category
  ON soc2_controls (category, sort_order);

CREATE TABLE IF NOT EXISTS soc2_evidence_artifacts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  provider           text NOT NULL,
  artifact_type      text NOT NULL,
  external_id        text,
  source_ref         text,
  data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_evidence_artifacts_org
  ON soc2_evidence_artifacts (organization_id, artifact_type);

CREATE TABLE IF NOT EXISTS soc2_control_evidence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  control_code       text NOT NULL,
  status             text NOT NULL,
  artifact_id        uuid,
  method             text NOT NULL,
  rule_id            text,
  model              text,
  confidence         numeric,
  rationale          text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_control_evidence_org
  ON soc2_control_evidence (organization_id, control_code);
CREATE INDEX IF NOT EXISTS idx_soc2_control_evidence_artifact
  ON soc2_control_evidence (artifact_id)
  WHERE artifact_id IS NOT NULL;
`;

/**
 * Weekly Gap Report & Remediation Queue (F1-006).
 *
 * ceo_briefing key_feature 3: "weekly automated gap analysis that re-scans
 * connected systems, flags new control failures, and updates a remediation
 * priority queue with owner assignments." The /api/cron/weekly-gap-rescan cron
 * re-runs the mapper, writes a DATED snapshot into soc2_gap_reports, diffs the
 * new snapshot against the previous one into soc2_gap_findings (new / resolved /
 * persisting), and upserts soc2_remediation_items with a severity, a suggested
 * owner (an @nexus/organizations-and-teams member) and a plain-English fix.
 *
 * Every row is organization_id-scoped. The remediation queue NEVER auto-closes a
 * finding: the hero screen's "Mark fixed" action routes to a human confirmation
 * (status fixed_pending_confirmation) before an item ever reaches resolved — the
 * liability_assessor human_in_loop requirement for misconfigurations.
 *
 * No CHECK constraints on free-form text columns (per task constraints); the
 * change_type / severity / status vocabularies are enforced in application code
 * (apps/web/lib/soc2/gaps/*).
 */
export const SOC2_GAPS_DDL = `
-- One dated snapshot per weekly re-scan. The three big numerals on /gaps
-- (controls with evidence, gaps, needs-review) and the gap-count sparkline read
-- directly off these rows.
CREATE TABLE IF NOT EXISTS soc2_gap_reports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL,
  generated_at             timestamptz NOT NULL DEFAULT now(),
  total_controls           integer NOT NULL DEFAULT 0,
  controls_with_evidence   integer NOT NULL DEFAULT 0,
  gaps                     integer NOT NULL DEFAULT 0,
  needs_review             integer NOT NULL DEFAULT 0,
  not_collected            integer NOT NULL DEFAULT 0,
  artifact_count           integer NOT NULL DEFAULT 0,
  trigger                  text NOT NULL DEFAULT 'weekly_cron',
  summary                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_gap_reports_org
  ON soc2_gap_reports (organization_id, generated_at DESC);

-- Per-control diff of a report against the one before it. change_type is one of
-- new | resolved | persisting. "What changed since last week" reads the newest
-- report's rows; the diff engine also reads the PREVIOUS report's rows to know
-- which controls were already failing.
CREATE TABLE IF NOT EXISTS soc2_gap_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid NOT NULL,
  organization_id    uuid NOT NULL,
  control_code       text NOT NULL,
  control_title      text,
  change_type        text NOT NULL,
  current_status     text NOT NULL,
  previous_status    text,
  rationale          text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_gap_findings_report
  ON soc2_gap_findings (report_id, change_type);
CREATE INDEX IF NOT EXISTS idx_soc2_gap_findings_org
  ON soc2_gap_findings (organization_id, control_code);

-- The living remediation priority queue. One row per (org, control_code): the
-- weekly re-scan upserts it, refreshing severity / owner / due date while
-- preserving human decisions (status + resolved_at). Resolved items are kept for
-- the "resolved" history, never deleted.
CREATE TABLE IF NOT EXISTS soc2_remediation_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,
  control_code          text NOT NULL,
  title                 text NOT NULL,
  severity              text NOT NULL DEFAULT 'medium',
  status                text NOT NULL DEFAULT 'open',
  owner_user_id         uuid,
  owner_email           text,
  suggested_fix         text NOT NULL DEFAULT '',
  rationale             text NOT NULL DEFAULT '',
  due_date              date,
  first_seen_report_id  uuid,
  last_seen_report_id   uuid,
  owner_notified_at     timestamptz,
  fixed_requested_by    uuid,
  fixed_requested_at    timestamptz,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, control_code)
);
CREATE INDEX IF NOT EXISTS idx_soc2_remediation_items_org
  ON soc2_remediation_items (organization_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_soc2_remediation_items_owner
  ON soc2_remediation_items (owner_user_id)
  WHERE owner_user_id IS NOT NULL;
`;

/**
 * Evidence-Anchored Policy Drafting Studio (F1-007).
 *
 * ceo_briefing key_feature 2: "automated generation of the 10 most-requested
 * SOC 2 policy documents ... tailored to the company's actual technical
 * environment rather than generic templates", with ai_automation_core requiring
 * "anchoring every policy clause to a retrieved evidence artifact".
 *
 * Model:
 *   - soc2_policies            — one row per (org, policy_key): the current
 *                                lifecycle state of a policy (not_started →
 *                                drafting → drafted → in_review → approved) and a
 *                                pointer to its current immutable version.
 *   - soc2_policy_versions     — IMMUTABLE snapshots. A draft, a regenerate, an
 *                                inline edit, or a status transition all append a
 *                                NEW version row; existing rows are never mutated
 *                                in place (content columns), so the audit trail
 *                                of what the auditor eventually reviewed is intact.
 *   - soc2_policy_clauses      — the clauses of a version. Each carries the
 *                                controls it covers plus an `unanchored` flag; an
 *                                unanchored clause is tinted and wears a
 *                                "needs your input" chip in the editor.
 *   - soc2_policy_clause_anchors — the evidence anchors: clause → the retrieved
 *                                soc2_evidence_artifacts row that substantiates
 *                                it. No anchor row is ever written for an
 *                                artifact_id outside the org's own evidence set
 *                                (hallucination guard in drafter.ts).
 *   - soc2_policy_accepted_phrasings — prior human-accepted clause phrasings,
 *                                recalled on the next draft (also mirrored to
 *                                @nexus/memory-and-knowledge, best-effort).
 *
 * Every row is organization_id-scoped. No CHECK constraints on free-form text
 * columns (per task constraints); the status vocabulary is enforced in
 * application code (apps/web/lib/soc2/drafting/*).
 */
export const SOC2_POLICIES_DDL = `
CREATE TABLE IF NOT EXISTS soc2_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  policy_key          text NOT NULL,
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'not_started',
  current_version_id  uuid,
  current_version_no  integer NOT NULL DEFAULT 0,
  last_drafted_at     timestamptz,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  approved_by         uuid,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, policy_key)
);
CREATE INDEX IF NOT EXISTS idx_soc2_policies_org
  ON soc2_policies (organization_id, policy_key);

CREATE TABLE IF NOT EXISTS soc2_policy_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  policy_key          text NOT NULL,
  version_no          integer NOT NULL,
  status              text NOT NULL DEFAULT 'drafted',
  title               text NOT NULL,
  summary             text NOT NULL DEFAULT '',
  source              text NOT NULL DEFAULT 'llm_gateway',
  model               text,
  clause_count        integer NOT NULL DEFAULT 0,
  anchored_count      integer NOT NULL DEFAULT 0,
  unanchored_count    integer NOT NULL DEFAULT 0,
  drafted_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_policy_versions_policy
  ON soc2_policy_versions (organization_id, policy_key, version_no DESC);

CREATE TABLE IF NOT EXISTS soc2_policy_clauses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id          uuid NOT NULL,
  organization_id     uuid NOT NULL,
  clause_index        integer NOT NULL,
  heading             text NOT NULL,
  body                text NOT NULL,
  control_codes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  unanchored          boolean NOT NULL DEFAULT false,
  needs_input_reason  text,
  edited_by_human     boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_policy_clauses_version
  ON soc2_policy_clauses (version_id, clause_index);

CREATE TABLE IF NOT EXISTS soc2_policy_clause_anchors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id           uuid NOT NULL,
  version_id          uuid NOT NULL,
  organization_id     uuid NOT NULL,
  artifact_id         uuid NOT NULL,
  control_code        text,
  label               text NOT NULL DEFAULT '',
  snippet             text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_policy_clause_anchors_clause
  ON soc2_policy_clause_anchors (clause_id);
CREATE INDEX IF NOT EXISTS idx_soc2_policy_clause_anchors_artifact
  ON soc2_policy_clause_anchors (artifact_id);

CREATE TABLE IF NOT EXISTS soc2_policy_accepted_phrasings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  policy_key          text NOT NULL,
  heading             text NOT NULL,
  body                text NOT NULL,
  control_codes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_by         uuid,
  version_id          uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soc2_policy_accepted_phrasings_policy
  ON soc2_policy_accepted_phrasings (organization_id, policy_key, created_at DESC);
`;
