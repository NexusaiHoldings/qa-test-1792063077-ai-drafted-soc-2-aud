/**
 * AUTO-RECOVERED table DDL (table-ref-autorecover-001).
 *
 * The integration table-ref gate found these tables queried by apps/web
 * with no creating DDL. Columns are inferred from the SQL the build agents
 * wrote (best-effort, loosely typed) so migrate.ts creates them at deploy
 * and the runtime queries don't 500. Reviewable + replaceable: if a feature
 * later adds a richer hand-written DDL for one of these tables, delete its
 * block here (CREATE TABLE IF NOT EXISTS would otherwise no-op the richer one).
 */

export const RECOVERED_SOC2_AUDITOR_ACCEPTANCE_RECORDS_DDL = `
CREATE TABLE IF NOT EXISTS soc2_auditor_acceptance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "accepted_at" timestamptz,
  "firm" text,
  "organization_id" uuid,
  "outcome" text,
  "policy_version_id" uuid,
  "revision_notes" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_SOC2_POLICY_ACCEPTED_PHRASINGS_DDL = `
CREATE TABLE IF NOT EXISTS soc2_policy_accepted_phrasings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "accepted_by" text,
  "body" text,
  "control_codes" text,
  "heading" text,
  "organization_id" uuid,
  "policy_key" text,
  "version_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_SOC2_POLICY_CLAUSE_ANCHORS_DDL = `
CREATE TABLE IF NOT EXISTS soc2_policy_clause_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_id" uuid,
  "clause_id" uuid,
  "clause_key" text,
  "confidence" text,
  "control_code" text,
  "criterion_code" text,
  "evidence_artifact_id" uuid,
  "evidence_snippet" text,
  "label" text,
  "metadata" jsonb,
  "organization_id" uuid,
  "policy_document_id" uuid,
  "policy_version_id" uuid,
  "rationale" text,
  "snippet" text,
  "version_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_SOC2_POLICY_CLAUSES_DDL = `
CREATE TABLE IF NOT EXISTS soc2_policy_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "body" text,
  "clause_index" text,
  "control_codes" text,
  "edited_by_human" text,
  "heading" text,
  "needs_input_reason" text,
  "organization_id" uuid,
  "unanchored" text,
  "version_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export const RECOVERED_SOC2_POLICY_DOCUMENTS_DDL = `
CREATE TABLE IF NOT EXISTS soc2_policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "current_version_id" uuid,
  "in_review" text,
  "organization_id" uuid,
  "status" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
