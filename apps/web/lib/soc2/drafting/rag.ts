/**
 * Retrieval layer for evidence-anchored drafting (F1-007, rag.ts).
 *
 * ceo_briefing.ai_automation_core describes the RAG layer as "AICPA SOC 2 Trust
 * Services Criteria embedded as a structured knowledge base" plus the customer's
 * own evidence. This module assembles, PER POLICY:
 *
 *   1. the controls the policy documents (from the embedded TSC catalog),
 *   2. each control's CURRENT mapping status (soc2_control_evidence, written by
 *      the F1-005 mapper),
 *   3. the redacted summaries of the artifacts that anchor those controls, and
 *   4. prior human-accepted clause phrasings recalled via
 *      @nexus/memory-and-knowledge (best-effort), merged with the durable local
 *      soc2_policy_accepted_phrasings table.
 *
 * The output (RagContext) is the sole input the drafter feeds to the gateway:
 * drafting is "tailored to the company's actual technical environment rather than
 * generic templates" because every anchorable fact comes from a real, redacted
 * artifact — and a control with NO evidence can only produce an UNANCHORED clause.
 */

import {
  handleRecallMemories,
  handleStoreMemory,
} from "@nexus/memory-and-knowledge";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getControl, type TscControl } from "@/lib/soc2/tsc/seed";
import type { MappingStatus } from "@/lib/soc2/tsc/rules";
import {
  getPolicy,
  POLICY_CATALOG,
  type PolicyDescriptor,
} from "@/lib/soc2/drafting/catalog";
import { redactArtifact, type RedactedArtifact } from "@/lib/soc2/drafting/redact";

/** Structural Db type — never imports the pg adapter directly. */
export interface RagDb {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

/** The rolled-up status shown per control in the RAG context. */
export type ControlRagStatus = MappingStatus | "not_collected";

/** One control inside a policy's retrieval context. */
export interface RagControl {
  readonly code: string;
  readonly title: string;
  readonly criteriaText: string;
  readonly pointsOfFocus: readonly string[];
  readonly status: ControlRagStatus;
  readonly rationale: string;
  /** The redacted artifacts that evidence this control (anchorable). */
  readonly artifacts: readonly RedactedArtifact[];
}

/** A prior human-accepted clause phrasing, recalled to steer the next draft. */
export interface AcceptedPhrasing {
  readonly heading: string;
  readonly body: string;
  readonly controlCodes: readonly string[];
  readonly source: "local" | "memory";
}

/** Everything the drafter needs for one policy. */
export interface RagContext {
  readonly policy: PolicyDescriptor;
  readonly controls: readonly RagControl[];
  /** The deduped set of anchorable artifacts across all this policy's controls. */
  readonly artifacts: readonly RedactedArtifact[];
  /** Fast lookup of a redacted artifact by id (anchor validation + rail). */
  readonly artifactsById: ReadonlyMap<string, RedactedArtifact>;
  readonly acceptedPhrasings: readonly AcceptedPhrasing[];
  readonly totalControls: number;
  readonly controlsWithEvidence: number;
  /** True when NO control has evidence — drafting is locked (empty state). */
  readonly locked: boolean;
}

interface EvidenceRow {
  control_code: string;
  status: string;
  artifact_id: string | null;
  rationale: string | null;
  artifact_provider: string | null;
  artifact_type: string | null;
  artifact_external_id: string | null;
  artifact_data: unknown;
  artifact_collected_at: string | null;
}

const STATUS_PRIORITY: Record<MappingStatus, number> = {
  evidence_found: 4,
  needs_human_review: 3,
  not_applicable_claimed: 2,
  gap: 1,
};

function coerceData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Load every evidence row (joined to its artifact) for a set of control codes in
 * one query, keyed by control code. Only rows with a status are returned.
 */
async function loadEvidenceForControls(
  db: RagDb,
  organizationId: string,
  controlCodes: readonly string[],
): Promise<Map<string, EvidenceRow[]>> {
  const map = new Map<string, EvidenceRow[]>();
  if (controlCodes.length === 0) return map;

  const rows = await db.query<EvidenceRow>(
    `SELECT e.control_code,
            e.status,
            e.artifact_id,
            e.rationale,
            a.provider       AS artifact_provider,
            a.artifact_type  AS artifact_type,
            a.external_id    AS artifact_external_id,
            a.data           AS artifact_data,
            a.collected_at   AS artifact_collected_at
       FROM soc2_control_evidence e
       LEFT JOIN soc2_evidence_artifacts a ON a.id = e.artifact_id
      WHERE e.organization_id = $1::uuid
        AND e.control_code = ANY($2::text[])
      ORDER BY e.control_code, e.created_at DESC`,
    organizationId,
    controlCodes as string[],
  );

  for (const row of rows) {
    const bucket = map.get(row.control_code) ?? [];
    bucket.push(row);
    map.set(row.control_code, bucket);
  }
  return map;
}

/** Roll a control's evidence rows up to a single display status. */
function rollupStatus(rows: readonly EvidenceRow[] | undefined): ControlRagStatus {
  if (!rows || rows.length === 0) return "not_collected";
  let best: MappingStatus = "gap";
  for (const row of rows) {
    const s = row.status as MappingStatus;
    if (STATUS_PRIORITY[s] !== undefined && STATUS_PRIORITY[s] > STATUS_PRIORITY[best]) {
      best = s;
    }
  }
  return best;
}

/** Build a RagControl for one TSC control from its evidence rows. */
function buildRagControl(
  control: TscControl,
  rows: readonly EvidenceRow[] | undefined,
  artifactSink: Map<string, RedactedArtifact>,
): RagControl {
  const status = rollupStatus(rows);
  const artifacts: RedactedArtifact[] = [];
  let rationale = "";

  for (const row of rows ?? []) {
    if (row.status === "evidence_found" && row.artifact_id) {
      const redacted = redactArtifact({
        id: row.artifact_id,
        provider: row.artifact_provider ?? "unknown",
        artifactType: row.artifact_type ?? "artifact",
        externalId: row.artifact_external_id,
        collectedAt: row.artifact_collected_at,
        data: coerceData(row.artifact_data),
      });
      artifacts.push(redacted);
      artifactSink.set(redacted.id, redacted);
    }
    if (!rationale && row.rationale) rationale = row.rationale;
  }

  return {
    code: control.code,
    title: control.title,
    criteriaText: control.criteriaText,
    pointsOfFocus: control.pointsOfFocus,
    status,
    rationale,
    artifacts,
  };
}

// ─── Accepted-phrasing recall (@nexus/memory-and-knowledge + local) ──────────

const MEMORY_DISCIPLINE = "soc2_policy_phrasing";

/**
 * Recall prior accepted phrasings for a policy. Reads the durable local table
 * first (reliable), then best-effort augments from the memory lego. Any memory
 * failure is swallowed — recall must never break drafting.
 */
export async function recallAcceptedPhrasings(
  db: RagDb,
  organizationId: string,
  policyKey: string,
  limit = 12,
): Promise<AcceptedPhrasing[]> {
  const out: AcceptedPhrasing[] = [];

  try {
    const rows = await db.query<{
      heading: string;
      body: string;
      control_codes: unknown;
    }>(
      `SELECT heading, body, control_codes
         FROM soc2_policy_accepted_phrasings
        WHERE organization_id = $1::uuid AND policy_key = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      organizationId,
      policyKey,
      limit,
    );
    for (const row of rows) {
      out.push({
        heading: row.heading,
        body: row.body,
        controlCodes: toStringArray(row.control_codes),
        source: "local",
      });
    }
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.rag", msg: "local_phrasing_recall_failed", error: String(err) }),
    );
  }

  // Best-effort memory-lego recall (long-term tier). Never throws.
  try {
    const result = await handleRecallMemories({
      query: {
        portfolio_company_id: organizationId,
        memory_tier: "long_term",
        discipline: MEMORY_DISCIPLINE,
        limit: String(limit),
      },
      ctx: { db: buildDb(), events: buildEventBus() },
    });
    if (result.status === 200 && typeof result.body === "object") {
      const memories = (result.body as Record<string, unknown>).memories;
      if (Array.isArray(memories)) {
        for (const mem of memories) {
          const payload = (mem as Record<string, unknown>)?.payload_json;
          const parsed = typeof payload === "string" ? safeParse(payload) : payload;
          if (parsed && typeof parsed === "object") {
            const p = parsed as Record<string, unknown>;
            if (p.policy_key === policyKey && typeof p.heading === "string" && typeof p.body === "string") {
              out.push({
                heading: p.heading,
                body: p.body,
                controlCodes: toStringArray(p.control_codes),
                source: "memory",
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.rag", msg: "memory_recall_failed", error: String(err) }),
    );
  }

  return out.slice(0, limit);
}

/**
 * Persist a human-accepted phrasing both locally (durable) and to the memory
 * lego (best-effort). Called from the drafter on policy approval so the next
 * draft of this policy can reuse the wording.
 */
export async function storeAcceptedPhrasing(
  db: RagDb,
  organizationId: string,
  input: {
    policyKey: string;
    heading: string;
    body: string;
    controlCodes: readonly string[];
    acceptedBy: string | null;
    versionId: string | null;
  },
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO soc2_policy_accepted_phrasings
         (organization_id, policy_key, heading, body, control_codes, accepted_by, version_id)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)`,
      organizationId,
      input.policyKey,
      input.heading,
      input.body,
      JSON.stringify([...input.controlCodes]),
      input.acceptedBy,
      input.versionId,
    );
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.rag", msg: "local_phrasing_store_failed", error: String(err) }),
    );
  }

  // Mirror to the memory lego (long-term). FK-guarded + swallowed: the memory
  // table may FK to a portfolio companies row this org is not part of, so a
  // failure here is expected in some deployments and must not break approval.
  try {
    await handleStoreMemory({
      body: {
        portfolio_company_id: organizationId,
        portfolio_user_id: input.acceptedBy ?? undefined,
        memory_tier: "long_term",
        discipline: MEMORY_DISCIPLINE,
        memory_type: "accepted_phrasing",
        importance: "high",
        payload: {
          policy_key: input.policyKey,
          heading: input.heading,
          body: input.body,
          control_codes: [...input.controlCodes],
        },
      },
      config: {},
      ctx: { db: buildDb(), events: buildEventBus() },
    });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.rag", msg: "memory_store_failed", error: String(err) }),
    );
  }
}

// ─── Public assembly API ─────────────────────────────────────────────────────

/**
 * Assemble the full retrieval context for one policy. Returns null for an
 * unknown policy slug.
 */
export async function assemblePolicyContext(
  db: RagDb,
  organizationId: string,
  policyKey: string,
): Promise<RagContext | null> {
  const policy = getPolicy(policyKey);
  if (!policy) return null;

  const codes = [...policy.controlCodes];
  const evidence = await loadEvidenceForControls(db, organizationId, codes);
  const artifactsById = new Map<string, RedactedArtifact>();

  const controls: RagControl[] = [];
  let controlsWithEvidence = 0;
  for (const code of codes) {
    const control = getControl(code);
    if (!control) continue;
    const ragControl = buildRagControl(control, evidence.get(code), artifactsById);
    if (ragControl.status === "evidence_found") controlsWithEvidence += 1;
    controls.push(ragControl);
  }

  const acceptedPhrasings = await recallAcceptedPhrasings(db, organizationId, policyKey);

  return {
    policy,
    controls,
    artifacts: [...artifactsById.values()],
    artifactsById,
    acceptedPhrasings,
    totalControls: controls.length,
    controlsWithEvidence,
    locked: controlsWithEvidence === 0,
  };
}

/** Lifecycle status of a policy, surfaced on the gallery cards. */
export type PolicyLifecycle =
  | "not_started"
  | "drafting"
  | "drafted"
  | "in_review"
  | "approved";

/** Gallery summary for one policy card. */
export interface PolicyState {
  readonly policy: PolicyDescriptor;
  readonly status: PolicyLifecycle;
  readonly currentVersionNo: number;
  readonly clauseCount: number;
  readonly anchoredCount: number;
  readonly unanchoredCount: number;
  readonly totalControls: number;
  readonly controlsWithEvidence: number;
  /** True when no control has evidence yet — drafting is locked. */
  readonly locked: boolean;
  readonly updatedAt: string | null;
}

interface PolicyRow {
  policy_key: string;
  status: string;
  current_version_no: number | string | null;
  updated_at: string | null;
}

interface VersionRow {
  policy_key: string;
  clause_count: number | string | null;
  anchored_count: number | string | null;
  unanchored_count: number | string | null;
}

const VALID_LIFECYCLE: ReadonlySet<string> = new Set([
  "not_started",
  "drafting",
  "drafted",
  "in_review",
  "approved",
]);

/**
 * Summarize all 10 policies for the gallery in a handful of queries: the policy
 * rows, the current-version clause counts, and the per-control evidence counts.
 */
export async function summarizePolicyStates(
  db: RagDb,
  organizationId: string,
): Promise<PolicyState[]> {
  const policyRows = await db.query<PolicyRow>(
    `SELECT policy_key, status, current_version_no, updated_at
       FROM soc2_policies
      WHERE organization_id = $1::uuid`,
    organizationId,
  );
  const byKey = new Map<string, PolicyRow>();
  for (const row of policyRows) byKey.set(row.policy_key, row);

  const versionRows = await db.query<VersionRow>(
    `SELECT p.policy_key,
            v.clause_count,
            v.anchored_count,
            v.unanchored_count
       FROM soc2_policies p
       JOIN soc2_policy_versions v ON v.id = p.current_version_id
      WHERE p.organization_id = $1::uuid`,
    organizationId,
  );
  const versionByKey = new Map<string, VersionRow>();
  for (const row of versionRows) versionByKey.set(row.policy_key, row);

  // Evidence coverage per control across all policies in one query.
  const allCodes = POLICY_CATALOG.flatMap((p) => [...p.controlCodes]);
  const coveredCodes = await loadCoveredControlCodes(db, organizationId, allCodes);

  const states: PolicyState[] = [];
  for (const policy of POLICY_CATALOG) {
    const row = byKey.get(policy.key);
    const version = versionByKey.get(policy.key);
    const statusRaw = row?.status ?? "not_started";
    const status = (VALID_LIFECYCLE.has(statusRaw) ? statusRaw : "not_started") as PolicyLifecycle;
    const controlsWithEvidence = policy.controlCodes.filter((c) => coveredCodes.has(c)).length;
    states.push({
      policy,
      status,
      currentVersionNo: toNumber(row?.current_version_no),
      clauseCount: toNumber(version?.clause_count),
      anchoredCount: toNumber(version?.anchored_count),
      unanchoredCount: toNumber(version?.unanchored_count),
      totalControls: policy.controlCodes.length,
      controlsWithEvidence,
      locked: controlsWithEvidence === 0,
      updatedAt: row?.updated_at ?? null,
    });
  }
  return states;
}

/** The subset of control codes with at least one evidence_found row. */
async function loadCoveredControlCodes(
  db: RagDb,
  organizationId: string,
  controlCodes: readonly string[],
): Promise<Set<string>> {
  const covered = new Set<string>();
  if (controlCodes.length === 0) return covered;
  const rows = await db.query<{ control_code: string }>(
    `SELECT DISTINCT control_code
       FROM soc2_control_evidence
      WHERE organization_id = $1::uuid
        AND status = 'evidence_found'
        AND control_code = ANY($2::text[])`,
    organizationId,
    controlCodes as string[],
  );
  for (const row of rows) covered.add(row.control_code);
  return covered;
}

// ─── small helpers ───────────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string") as string[];
  if (typeof value === "string") {
    const parsed = safeParse(value);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string") as string[];
  }
  return [];
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
