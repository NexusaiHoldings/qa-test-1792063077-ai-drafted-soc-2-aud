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
