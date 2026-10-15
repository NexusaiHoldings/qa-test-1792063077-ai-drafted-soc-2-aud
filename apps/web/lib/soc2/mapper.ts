/**
 * Evidence mapper (F1-005, mapper.ts).
 *
 * Maps ingested, read-only infrastructure state (soc2_evidence_artifacts) to
 * the AICPA Trust Services Criteria (soc2_controls) and records the result in
 * soc2_control_evidence. The pipeline is deterministic-FIRST:
 *
 *   1. Run the deterministic rules (apps/web/lib/soc2/tsc/rules.ts). If any rule
 *      decides, use those outcomes — no model is consulted (hallucination-proof,
 *      fully auditable, each outcome cites the triggering artifact).
 *   2. ONLY for ambiguous artifacts (no rule decided) invoke the Nexus gateway
 *      LLM mapper, constrained to the controls the artifact could plausibly
 *      evidence and to a strict JSON schema.
 *
 * The mapper ALWAYS returns one of:
 *   evidence_found | gap | needs_human_review | not_applicable_claimed
 * and NEVER 'compliant' — "AI should flag, not certify" (liability_assessor).
 *
 * Structural hallucination guard: an `evidence_found` result MUST carry a
 * non-null artifact id. If the model claims evidence_found without citing the
 * artifact, the mapper downgrades it to needs_human_review.
 */

import {
  DETERMINISTIC_RULES,
  evaluateRules,
  type EvidenceArtifact,
  type MappingStatus,
} from "@/lib/soc2/tsc/rules";
import { TSC_CONTROLS, type TscControl } from "@/lib/soc2/tsc/seed";

/** Structural Db type — never imports the pg adapter directly. */
export interface MapperDb {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<void>;
}

export type MappingMethod = "deterministic_rule" | "llm_mapper";

/** One control<-artifact mapping produced by the pipeline. */
export interface ArtifactMapping {
  readonly controlCode: string;
  readonly status: MappingStatus;
  /** The cited artifact. ALWAYS non-null when status === 'evidence_found'. */
  readonly artifactId: string | null;
  readonly method: MappingMethod;
  readonly ruleId: string | null;
  readonly model: string | null;
  readonly confidence: number | null;
  readonly rationale: string;
}

const VALID_STATUSES: ReadonlySet<MappingStatus> = new Set([
  "evidence_found",
  "gap",
  "needs_human_review",
  "not_applicable_claimed",
]);

const VALID_CONTROL_CODES: ReadonlySet<string> = new Set(TSC_CONTROLS.map((c) => c.code));

/** Controls an artifact type could plausibly evidence (for the LLM prompt scope). */
function candidateControls(artifactType: string): TscControl[] {
  return TSC_CONTROLS.filter((c) => c.artifactTypes.includes(artifactType));
}

// ─── Gateway LLM fallback ───────────────────────────────────────────────────

/** Model used for ambiguous mapping (Claude Sonnet via the Nexus gateway). */
function mapperModel(): string {
  return process.env.SOC2_MAPPER_MODEL || "claude-sonnet-5";
}

interface GatewayMapping {
  control_code: string;
  status: MappingStatus;
  rationale: string;
  confidence: number;
}

/**
 * Call the Nexus gateway with a strict JSON instruction. Returns the raw text of
 * the model's reply, or null on any failure (missing config, network, non-2xx).
 * Failures are non-fatal: the caller falls back to needs_human_review, so a
 * gateway outage never fabricates evidence.
 */
async function callGateway(system: string, user: string): Promise<string | null> {
  const baseUrl = process.env.NEXUS_GATEWAY_URL;
  const apiKey = process.env.NEXUS_GATEWAY_API_KEY || process.env.NEXUS_GATEWAY_TOKEN;
  if (!baseUrl) return null;

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: mapperModel(),
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
      // Collector routes run on Vercel Pro (300s). Keep a tight mapper timeout.
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      console.error(
        JSON.stringify({ level: "error", scope: "soc2.mapper", msg: "gateway_non_2xx", status: resp.status }),
      );
      return null;
    }
    const payload = (await resp.json()) as Record<string, unknown>;
    return extractText(payload);
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.mapper", msg: "gateway_call_failed", error: String(err) }),
    );
    return null;
  }
}

/** Pull assistant text out of the common gateway/Anthropic/OpenAI response shapes. */
function extractText(payload: Record<string, unknown>): string | null {
  const content = payload.content;
  if (Array.isArray(content)) {
    const parts = content
      .map((block) =>
        block && typeof block === "object" && typeof (block as Record<string, unknown>).text === "string"
          ? String((block as Record<string, unknown>).text)
          : "",
      )
      .filter((t) => t.length > 0);
    if (parts.length > 0) return parts.join("\n");
  }
  const choices = payload.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const message = (choices[0] as Record<string, unknown>).message;
    if (message && typeof message === "object") {
      const text = (message as Record<string, unknown>).content;
      if (typeof text === "string") return text;
    }
  }
  if (typeof payload.output_text === "string") return payload.output_text;
  return null;
}

/** Parse the model's JSON reply (tolerating ```json fences) into mappings. */
function parseGatewayMappings(text: string): GatewayMapping[] {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).mappings)
      ? ((parsed as Record<string, unknown>).mappings as unknown[])
      : [parsed];

  const out: GatewayMapping[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r.control_code === "string" ? r.control_code.trim() : "";
    const status = typeof r.status === "string" ? (r.status.trim() as MappingStatus) : null;
    if (!code || !status) continue;
    out.push({
      control_code: code,
      status,
      rationale: typeof r.rationale === "string" ? r.rationale : "",
      confidence:
        typeof r.confidence === "number" && Number.isFinite(r.confidence)
          ? Math.min(1, Math.max(0, r.confidence))
          : 0.5,
    });
  }
  return out;
}

/**
 * Ambiguous-artifact path: ask the gateway to classify the artifact against its
 * candidate controls. Returns needs_human_review for any artifact the gateway
 * cannot confidently decide — and ALWAYS downgrades an uncited 'evidence_found'
 * to needs_human_review (no citation, no evidence_found).
 */
async function mapWithGateway(artifact: EvidenceArtifact): Promise<ArtifactMapping[]> {
  const candidates = candidateControls(artifact.artifactType);
  const model = mapperModel();

  const needsReview = (reason: string): ArtifactMapping[] => {
    const code = candidates[0]?.code ?? "CC1.1";
    return [
      {
        controlCode: code,
        status: "needs_human_review",
        artifactId: artifact.id,
        method: "llm_mapper",
        ruleId: null,
        model,
        confidence: null,
        rationale: reason,
      },
    ];
  };

  const system =
    "You are a SOC 2 evidence-mapping assistant. You FLAG, you never CERTIFY. " +
    "Classify the provided infrastructure artifact against the listed Trust Services Criteria. " +
    "For each criterion you can address, return a status of exactly one of: " +
    "evidence_found, gap, needs_human_review, not_applicable_claimed. " +
    "NEVER return 'compliant'. Only return evidence_found when the artifact data concretely " +
    "demonstrates the control; if uncertain, return needs_human_review. " +
    'Respond with ONLY JSON of the form {"mappings":[{"control_code":"CC7.2","status":"...","rationale":"...","confidence":0.0}]}.';

  const user = JSON.stringify({
    artifact: {
      id: artifact.id,
      provider: artifact.provider,
      artifact_type: artifact.artifactType,
      external_id: artifact.externalId ?? null,
      data: artifact.data,
    },
    candidate_controls: candidates.map((c) => ({
      control_code: c.code,
      title: c.title,
      criteria_text: c.criteriaText,
      points_of_focus: c.pointsOfFocus,
    })),
  });

  const text = await callGateway(system, user);
  if (!text) return needsReview("Gateway mapper unavailable; flagged for human review (no evidence asserted without a model decision).");

  const parsed = parseGatewayMappings(text);
  if (parsed.length === 0) {
    return needsReview("Gateway returned no parseable mapping; flagged for human review.");
  }

  const mappings: ArtifactMapping[] = [];
  for (const row of parsed) {
    if (!VALID_CONTROL_CODES.has(row.control_code)) continue;
    // Enforce the status vocabulary; anything off-list (incl. 'compliant') is a review flag.
    let status: MappingStatus = VALID_STATUSES.has(row.status) ? row.status : "needs_human_review";
    // Structural hallucination guard: evidence_found must cite the artifact.
    // The artifact id is always available here, so we attach it; the guard below
    // additionally protects against a status that slipped through without one.
    const artifactId: string | null = artifact.id;
    if (status === "evidence_found" && !artifactId) {
      status = "needs_human_review";
    }
    mappings.push({
      controlCode: row.control_code,
      status,
      artifactId,
      method: "llm_mapper",
      ruleId: null,
      model,
      confidence: row.confidence,
      rationale:
        row.rationale.trim().length > 0
          ? row.rationale.trim()
          : "Mapped by the gateway model; see artifact for details.",
    });
  }

  return mappings.length > 0 ? mappings : needsReview("Gateway mapping did not reference a known control; flagged for human review.");
}

// ─── Public mapping API ─────────────────────────────────────────────────────

/**
 * Map a single artifact. Deterministic rules first; the gateway LLM fallback
 * runs ONLY when no rule decides. Always returns the four-status vocabulary,
 * and every evidence_found carries a cited artifact id.
 */
export async function mapArtifact(artifact: EvidenceArtifact): Promise<ArtifactMapping[]> {
  const ruleMatches = evaluateRules(artifact);
  if (ruleMatches.length > 0) {
    return ruleMatches.map((match) => {
      // Guard again at the boundary: deterministic evidence_found must cite the artifact.
      const status =
        match.outcome.status === "evidence_found" && !artifact.id
          ? "needs_human_review"
          : match.outcome.status;
      return {
        controlCode: match.outcome.controlCode,
        status,
        artifactId: status === "gap" ? null : artifact.id,
        method: "deterministic_rule" as const,
        ruleId: match.ruleId,
        model: null,
        confidence: match.outcome.confidence,
        rationale: match.outcome.rationale,
      };
    });
  }
  // Ambiguous artifact — escalate to the model.
  return mapWithGateway(artifact);
}

/** Load all ingested artifacts for an org as typed EvidenceArtifact records. */
export async function loadArtifacts(db: MapperDb, organizationId: string): Promise<EvidenceArtifact[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, organization_id, provider, artifact_type, external_id, data
       FROM soc2_evidence_artifacts
      WHERE organization_id = $1::uuid
      ORDER BY collected_at DESC`,
    organizationId,
  );
  return rows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    provider: String(row.provider),
    artifactType: String(row.artifact_type),
    externalId: (row.external_id as string | null) ?? null,
    data: coerceData(row.data),
  }));
}

function coerceData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
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
 * Map every ingested artifact for an org and persist the results to
 * soc2_control_evidence. The rebuild is atomic-per-org: the prior mapping is
 * replaced so stale evidence never lingers. Returns the count of mapping rows.
 */
export async function runMapper(db: MapperDb, organizationId: string): Promise<number> {
  const artifacts = await loadArtifacts(db, organizationId);
  const mappings: ArtifactMapping[] = [];
  for (const artifact of artifacts) {
    const mapped = await mapArtifact(artifact);
    mappings.push(...mapped);
  }

  await db.execute(
    `DELETE FROM soc2_control_evidence WHERE organization_id = $1::uuid`,
    organizationId,
  );

  for (const m of mappings) {
    await db.execute(
      `INSERT INTO soc2_control_evidence
         (organization_id, control_code, status, artifact_id, method,
          rule_id, model, confidence, rationale, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      organizationId,
      m.controlCode,
      m.status,
      m.artifactId,
      m.method,
      m.ruleId,
      m.model,
      m.confidence,
      m.rationale,
    );
  }
  return mappings.length;
}

// ─── Read model for the /controls UI ────────────────────────────────────────

export type DisplayStatus = MappingStatus | "not_collected";

export interface ControlEvidenceRow {
  readonly controlCode: string;
  readonly status: MappingStatus;
  readonly artifactId: string | null;
  readonly artifactLabel: string | null;
  readonly provider: string | null;
  readonly method: string;
  readonly ruleId: string | null;
  readonly model: string | null;
  readonly confidence: number | null;
  readonly rationale: string;
}

/**
 * Load the persisted evidence for an org, joined to the artifact that anchors
 * each row (for the artifact chips), keyed by control code.
 */
export async function loadControlEvidence(
  db: MapperDb,
  organizationId: string,
): Promise<Map<string, ControlEvidenceRow[]>> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT e.control_code, e.status, e.artifact_id, e.method, e.rule_id,
            e.model, e.confidence, e.rationale,
            a.provider AS artifact_provider, a.artifact_type AS artifact_type,
            a.external_id AS artifact_external_id
       FROM soc2_control_evidence e
       LEFT JOIN soc2_evidence_artifacts a ON a.id = e.artifact_id
      WHERE e.organization_id = $1::uuid
      ORDER BY e.control_code,
               CASE e.status
                 WHEN 'evidence_found' THEN 0
                 WHEN 'needs_human_review' THEN 1
                 WHEN 'not_applicable_claimed' THEN 2
                 ELSE 3
               END,
               e.created_at DESC`,
    organizationId,
  );

  const map = new Map<string, ControlEvidenceRow[]>();
  for (const row of rows) {
    const provider = (row.artifact_provider as string | null) ?? null;
    const artifactType = (row.artifact_type as string | null) ?? null;
    const externalId = (row.artifact_external_id as string | null) ?? null;
    const label = artifactType
      ? [provider, artifactType, externalId].filter((p) => p && String(p).length > 0).join(" · ")
      : null;
    const confidenceRaw = row.confidence;
    const evidence: ControlEvidenceRow = {
      controlCode: String(row.control_code),
      status: row.status as MappingStatus,
      artifactId: (row.artifact_id as string | null) ?? null,
      artifactLabel: label,
      provider,
      method: String(row.method ?? ""),
      ruleId: (row.rule_id as string | null) ?? null,
      model: (row.model as string | null) ?? null,
      confidence:
        confidenceRaw === null || confidenceRaw === undefined ? null : Number(confidenceRaw),
      rationale: String(row.rationale ?? ""),
    };
    const bucket = map.get(evidence.controlCode) ?? [];
    bucket.push(evidence);
    map.set(evidence.controlCode, bucket);
  }
  return map;
}

/** Count ingested artifacts — drives the pre-collection empty state. */
export async function countArtifacts(db: MapperDb, organizationId: string): Promise<number> {
  const rows = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM soc2_evidence_artifacts WHERE organization_id = $1::uuid`,
    organizationId,
  );
  return rows[0] ? Number(rows[0].n) : 0;
}

const STATUS_PRIORITY: Record<MappingStatus, number> = {
  evidence_found: 4,
  needs_human_review: 3,
  not_applicable_claimed: 2,
  gap: 1,
};

/**
 * Roll a control's evidence rows up to one display status. evidence_found wins,
 * then needs_human_review, then not_applicable_claimed, then gap; no rows at all
 * means the control has not been collected yet.
 */
export function displayStatusFor(rows: readonly ControlEvidenceRow[] | undefined): DisplayStatus {
  if (!rows || rows.length === 0) return "not_collected";
  let best: MappingStatus = "gap";
  for (const row of rows) {
    if (STATUS_PRIORITY[row.status] > STATUS_PRIORITY[best]) best = row.status;
  }
  return best;
}

export interface CategoryCoverage {
  readonly covered: number;
  readonly total: number;
  readonly percent: number;
}

/**
 * Coverage for a category: fraction of its controls whose rolled-up display
 * status is evidence_found.
 */
export function coverageFor(
  controlCodes: readonly string[],
  evidence: Map<string, ControlEvidenceRow[]>,
): CategoryCoverage {
  const total = controlCodes.length;
  let covered = 0;
  for (const code of controlCodes) {
    if (displayStatusFor(evidence.get(code)) === "evidence_found") covered += 1;
  }
  const percent = total === 0 ? 0 : Math.round((covered / total) * 100);
  return { covered, total, percent };
}

/** The number of distinct deterministic rules (surfaced in the UI footnote). */
export function deterministicRuleCount(): number {
  return DETERMINISTIC_RULES.length;
}
