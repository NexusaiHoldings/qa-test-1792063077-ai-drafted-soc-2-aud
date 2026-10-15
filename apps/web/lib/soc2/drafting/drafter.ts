/**
 * Evidence-anchored policy drafter (F1-007, drafter.ts).
 *
 * Orchestrates drafting: assemble the RAG context (rag.ts), call the Nexus
 * gateway with the structured-output prompt (prompts.ts), validate the returned
 * clauses, and persist them as an IMMUTABLE version
 * (soc2_policy_versions + soc2_policy_clauses + soc2_policy_clause_anchors).
 *
 * Two liability guards are enforced here, server-side, regardless of what the
 * model returns:
 *   - HALLUCINATION GUARD: a clause may only anchor to an artifact id that is in
 *     the org's own retrieved evidence set. Any other id is discarded; a clause
 *     left with no valid anchor is downgraded to `unanchored` + a needs-input
 *     reason. No clause ever claims evidence that does not exist.
 *   - DISTINCT-REVIEWER GUARD: approval requires a human who is NOT the drafter
 *     of the current version ("a distinct human reviewer action enforced
 *     server-side" — liability_assessor).
 *
 * The gateway is optional: when it is unavailable or returns nothing parseable,
 * a deterministic fallback drafts clauses straight from the control criteria and
 * the redacted evidence, so the studio always produces a reviewable draft and
 * never blocks on an outage.
 */

import {
  assemblePolicyContext,
  storeAcceptedPhrasing,
  type RagContext,
  type RagControl,
  type RagDb,
} from "@/lib/soc2/drafting/rag";
import { getPolicy, type PolicyDescriptor } from "@/lib/soc2/drafting/catalog";
import {
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  buildRegenerateSystemPrompt,
  buildRegenerateUserPrompt,
} from "@/lib/soc2/drafting/prompts";
import type { RedactedArtifact } from "@/lib/soc2/drafting/redact";

/** The non-dismissable disclaimer strip text (liability_assessor required). */
export const POLICY_DISCLAIMER =
  "AI-drafted. Requires human review before submission to auditors.";

/** A validated clause ready to persist. */
export interface DraftClause {
  readonly heading: string;
  readonly body: string;
  readonly controlCodes: readonly string[];
  /** Artifact ids that anchor this clause (always a subset of the org's evidence). */
  readonly anchorArtifactIds: readonly string[];
  readonly unanchored: boolean;
  readonly needsInputReason: string;
  readonly editedByHuman: boolean;
}

/** The parsed + validated output of a full draft. */
export interface DraftResult {
  readonly title: string;
  readonly summary: string;
  readonly clauses: readonly DraftClause[];
  readonly source: "llm_gateway" | "deterministic_fallback";
  readonly model: string | null;
}

/** Outcome returned by the drafting actions, surfaced back to the page. */
export interface DraftActionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly versionId?: string;
}

// ─── Gateway plumbing (mirrors mapper.ts for consistency) ────────────────────

function drafterModel(): string {
  return process.env.SOC2_DRAFTER_MODEL || "claude-sonnet-5";
}

async function callGateway(
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
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
        model: drafterModel(),
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      console.error(
        JSON.stringify({ level: "error", scope: "soc2.drafter", msg: "gateway_non_2xx", status: resp.status }),
      );
      return null;
    }
    const payload = (await resp.json()) as Record<string, unknown>;
    return extractText(payload);
  } catch (err) {
    console.error(
      JSON.stringify({ level: "error", scope: "soc2.drafter", msg: "gateway_call_failed", error: String(err) }),
    );
    return null;
  }
}

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

function stripFences(text: string): string {
  const cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1].trim() : cleaned;
}

// ─── Parsing + validation ────────────────────────────────────────────────────

interface RawClause {
  heading?: unknown;
  body?: unknown;
  control_codes?: unknown;
  anchor_artifact_ids?: unknown;
  unanchored?: unknown;
  needs_input?: unknown;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Validate one raw clause against the org's evidence set. Anchor ids not present
 * in `validArtifactIds` are discarded; a clause that ends up with no valid anchor
 * is forced unanchored with a needs-input reason.
 */
function validateClause(
  raw: RawClause,
  validArtifactIds: ReadonlySet<string>,
  editedByHuman = false,
): DraftClause | null {
  const heading = typeof raw.heading === "string" ? raw.heading.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!heading && !body) return null;

  const controlCodes = toStringArray(raw.control_codes);
  const requestedAnchors = toStringArray(raw.anchor_artifact_ids);
  const validAnchors = [...new Set(requestedAnchors.filter((id) => validArtifactIds.has(id)))];

  let unanchored = raw.unanchored === true;
  let needsInputReason = typeof raw.needs_input === "string" ? raw.needs_input.trim() : "";

  // Hallucination guard: no valid anchor ⇒ cannot be an anchored clause.
  if (validAnchors.length === 0) {
    unanchored = true;
    if (!needsInputReason) {
      needsInputReason =
        "No matching evidence artifact was found for this clause — confirm or provide the supporting evidence.";
    }
  } else {
    unanchored = false;
    needsInputReason = "";
  }

  return {
    heading: heading || "Untitled clause",
    body: body || "This clause needs your input.",
    controlCodes,
    anchorArtifactIds: validAnchors,
    unanchored,
    needsInputReason,
    editedByHuman,
  };
}

/** Parse the gateway's full-draft JSON into a validated DraftResult, or null. */
function parseDraftResult(
  text: string,
  ctx: RagContext,
  model: string,
): DraftResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const rawClauses = Array.isArray(obj.clauses) ? obj.clauses : [];
  if (rawClauses.length === 0) return null;

  const validIds = new Set(ctx.artifactsById.keys());
  const clauses: DraftClause[] = [];
  for (const rc of rawClauses) {
    if (!rc || typeof rc !== "object") continue;
    const clause = validateClause(rc as RawClause, validIds);
    if (clause) clauses.push(clause);
  }
  if (clauses.length === 0) return null;

  const title = typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : ctx.policy.title;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  return { title, summary, clauses, source: "llm_gateway", model };
}

// ─── Deterministic fallback ──────────────────────────────────────────────────

/** Reuse a prior accepted phrasing whose control codes overlap this control. */
function priorPhrasingFor(ctx: RagContext, controlCode: string): string | null {
  for (const phrasing of ctx.acceptedPhrasings) {
    if (phrasing.controlCodes.includes(controlCode) && phrasing.body.trim().length > 0) {
      return phrasing.body.trim();
    }
  }
  return null;
}

/** Build a clause body from a control's criteria + its redacted evidence. */
function deterministicClauseBody(control: RagControl): string {
  const lead = `The organization addresses ${control.title.toLowerCase()} in line with Trust Services Criterion ${control.code}: ${control.criteriaText}`;
  if (control.artifacts.length === 0) return lead;
  const facts = control.artifacts
    .map((a) => `${a.provider} ${a.artifactType.replace(/_/g, " ")} (${a.summary})`)
    .join("; ");
  return `${lead} This is evidenced by the organization's current configuration: ${facts}.`;
}

/**
 * Draft entirely from the retrieval context, no model. One clause per control:
 * anchored when the control has evidence_found artifacts, otherwise unanchored
 * with a needs-input reason. A leading scope clause is always unanchored (it
 * requires human confirmation of scope).
 */
function deterministicDraft(ctx: RagContext): DraftResult {
  const clauses: DraftClause[] = [];

  clauses.push({
    heading: "Purpose & Scope",
    body:
      `This ${ctx.policy.title} describes how the organization implements the controls in scope for its SOC 2 report. ` +
      `It is drafted from the organization's current technical environment and must be confirmed by a human owner.`,
    controlCodes: [],
    anchorArtifactIds: [],
    unanchored: true,
    needsInputReason: "Confirm the scope statement reflects your organization's systems and boundaries.",
    editedByHuman: false,
  });

  for (const control of ctx.controls) {
    const prior = priorPhrasingFor(ctx, control.code);
    const hasEvidence = control.artifacts.length > 0;
    const body = prior ?? deterministicClauseBody(control);
    clauses.push({
      heading: `${control.code} — ${control.title}`,
      body,
      controlCodes: [control.code],
      anchorArtifactIds: hasEvidence ? control.artifacts.map((a) => a.id) : [],
      unanchored: !hasEvidence,
      needsInputReason: hasEvidence
        ? ""
        : "No evidence has been collected for this control yet — connect the relevant system or attach evidence.",
      editedByHuman: false,
    });
  }

  return {
    title: ctx.policy.title,
    summary:
      `Draft ${ctx.policy.title} anchored to the organization's collected evidence. ` +
      `Clauses without supporting evidence are flagged for human input.`,
    clauses,
    source: "deterministic_fallback",
    model: null,
  };
}

// ─── Persistence (immutable versions) ────────────────────────────────────────

async function nextVersionNo(
  db: RagDb,
  organizationId: string,
  policyKey: string,
): Promise<number> {
  const rows = await db.query<{ max_no: number | string | null }>(
    `SELECT MAX(version_no) AS max_no
       FROM soc2_policy_versions
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  const max = rows[0]?.max_no;
  return (max === null || max === undefined ? 0 : Number(max)) + 1;
}

/**
 * Write a new immutable version with its clauses and anchors, then repoint the
 * policy row at it. Returns the new version id.
 */
async function writeVersion(
  db: RagDb,
  organizationId: string,
  policy: PolicyDescriptor,
  draft: DraftResult,
  artifactsById: ReadonlyMap<string, RedactedArtifact>,
  draftedBy: string | null,
  lifecycleStatus: string,
): Promise<string> {
  const versionNo = await nextVersionNo(db, organizationId, policy.key);
  const anchoredCount = draft.clauses.filter((c) => !c.unanchored).length;
  const unanchoredCount = draft.clauses.length - anchoredCount;

  const versionRows = await db.query<{ id: string }>(
    `INSERT INTO soc2_policy_versions
       (organization_id, policy_key, version_no, status, title, summary, source,
        model, clause_count, anchored_count, unanchored_count, drafted_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    organizationId,
    policy.key,
    versionNo,
    lifecycleStatus,
    draft.title,
    draft.summary,
    draft.source,
    draft.model,
    draft.clauses.length,
    anchoredCount,
    unanchoredCount,
    draftedBy,
  );
  const versionId = versionRows[0]!.id;

  for (let i = 0; i < draft.clauses.length; i += 1) {
    const clause = draft.clauses[i]!;
    const clauseRows = await db.query<{ id: string }>(
      `INSERT INTO soc2_policy_clauses
         (version_id, organization_id, clause_index, heading, body,
          control_codes, unanchored, needs_input_reason, edited_by_human)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING id`,
      versionId,
      organizationId,
      i,
      clause.heading,
      clause.body,
      JSON.stringify([...clause.controlCodes]),
      clause.unanchored,
      clause.needsInputReason || null,
      clause.editedByHuman,
    );
    const clauseId = clauseRows[0]!.id;

    for (const artifactId of clause.anchorArtifactIds) {
      const artifact = artifactsById.get(artifactId);
      if (!artifact) continue; // final hallucination guard at the DB boundary
      await db.execute(
        `INSERT INTO soc2_policy_clause_anchors
           (clause_id, version_id, organization_id, artifact_id, control_code, label, snippet)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7)`,
        clauseId,
        versionId,
        organizationId,
        artifact.id,
        clause.controlCodes[0] ?? null,
        `${artifact.provider} · ${artifact.artifactType}`,
        artifact.summary,
      );
    }
  }

  await db.execute(
    `INSERT INTO soc2_policies
       (organization_id, policy_key, title, status, current_version_id,
        current_version_no, last_drafted_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, now(), now())
     ON CONFLICT (organization_id, policy_key) DO UPDATE SET
       status = EXCLUDED.status,
       current_version_id = EXCLUDED.current_version_id,
       current_version_no = EXCLUDED.current_version_no,
       last_drafted_at = now(),
       updated_at = now()`,
    organizationId,
    policy.key,
    draft.title,
    lifecycleStatus,
    versionId,
    versionNo,
  );

  return versionId;
}

// ─── Public actions ──────────────────────────────────────────────────────────

/**
 * Draft (or re-draft) a whole policy. Returns an action result. Drafting is
 * refused when no control has evidence (the policy is locked / empty state).
 */
export async function draftPolicy(
  db: RagDb,
  organizationId: string,
  policyKey: string,
  userId: string,
): Promise<DraftActionResult> {
  const ctx = await assemblePolicyContext(db, organizationId, policyKey);
  if (!ctx) return { ok: false, message: "Unknown policy." };
  if (ctx.locked) {
    return {
      ok: false,
      message: "Drafting unlocks once at least one of this policy's controls has evidence.",
    };
  }

  let draft: DraftResult | null = null;
  const text = await callGateway(buildDraftSystemPrompt(), buildDraftUserPrompt(ctx), 4096);
  if (text) draft = parseDraftResult(text, ctx, drafterModel());
  if (!draft) draft = deterministicDraft(ctx);

  const versionId = await writeVersion(
    db,
    organizationId,
    ctx.policy,
    draft,
    ctx.artifactsById,
    userId,
    "drafted",
  );

  console.info(
    JSON.stringify({
      level: "info",
      scope: "soc2.drafter",
      msg: "policy_drafted",
      policy_key: policyKey,
      source: draft.source,
      clauses: draft.clauses.length,
    }),
  );

  return {
    ok: true,
    message:
      draft.source === "llm_gateway"
        ? "Draft generated from your evidence."
        : "Draft generated from your evidence (offline drafting).",
    versionId,
  };
}

interface ClauseRow {
  id: string;
  clause_index: number | string;
  heading: string;
  body: string;
  control_codes: unknown;
  unanchored: boolean;
  needs_input_reason: string | null;
  edited_by_human: boolean;
}

interface AnchorRow {
  clause_id: string;
  artifact_id: string;
  control_code: string | null;
  label: string;
  snippet: string;
}

/** Load the clauses (with anchors) of a version into DraftClause records. */
async function loadVersionClauses(
  db: RagDb,
  organizationId: string,
  versionId: string,
): Promise<DraftClause[]> {
  const clauseRows = await db.query<ClauseRow>(
    `SELECT id, clause_index, heading, body, control_codes, unanchored,
            needs_input_reason, edited_by_human
       FROM soc2_policy_clauses
      WHERE version_id = $1::uuid AND organization_id = $2::uuid
      ORDER BY clause_index ASC`,
    versionId,
    organizationId,
  );
  const anchorRows = await db.query<AnchorRow>(
    `SELECT clause_id, artifact_id, control_code, label, snippet
       FROM soc2_policy_clause_anchors
      WHERE version_id = $1::uuid AND organization_id = $2::uuid`,
    versionId,
    organizationId,
  );
  const anchorsByClause = new Map<string, string[]>();
  for (const a of anchorRows) {
    const bucket = anchorsByClause.get(a.clause_id) ?? [];
    bucket.push(a.artifact_id);
    anchorsByClause.set(a.clause_id, bucket);
  }

  return clauseRows.map((row) => ({
    heading: row.heading,
    body: row.body,
    controlCodes: Array.isArray(row.control_codes)
      ? (row.control_codes.filter((c) => typeof c === "string") as string[])
      : [],
    anchorArtifactIds: anchorsByClause.get(row.id) ?? [],
    unanchored: row.unanchored,
    needsInputReason: row.needs_input_reason ?? "",
    editedByHuman: row.edited_by_human,
  }));
}

/**
 * Regenerate a single clause from its control's evidence, writing a new version
 * (immutability). Editing invalidates any prior review — the policy returns to
 * the `drafted` state.
 */
export async function regenerateClause(
  db: RagDb,
  organizationId: string,
  policyKey: string,
  clauseIndex: number,
  userId: string,
): Promise<DraftActionResult> {
  const policy = getPolicy(policyKey);
  if (!policy) return { ok: false, message: "Unknown policy." };

  const current = await loadCurrentVersionId(db, organizationId, policyKey);
  if (!current) return { ok: false, message: "No draft to regenerate yet." };

  const clauses = await loadVersionClauses(db, organizationId, current);
  if (clauseIndex < 0 || clauseIndex >= clauses.length) {
    return { ok: false, message: "Clause not found." };
  }

  const ctx = await assemblePolicyContext(db, organizationId, policyKey);
  if (!ctx) return { ok: false, message: "Unknown policy." };

  const target = clauses[clauseIndex]!;
  const primaryCode = target.controlCodes[0];
  const control = ctx.controls.find((c) => c.code === primaryCode);
  const validIds = new Set(ctx.artifactsById.keys());

  let regenerated: DraftClause | null = null;
  if (control) {
    const evidence = control.artifacts.map((a) => ({
      artifact_id: a.id,
      provider: a.provider,
      artifact_type: a.artifactType,
      summary: a.summary,
      facts: a.facts,
    }));
    const text = await callGateway(
      buildRegenerateSystemPrompt(),
      buildRegenerateUserPrompt({
        policyTitle: policy.title,
        controlCode: control.code,
        controlTitle: control.title,
        criteriaText: control.criteriaText,
        pointsOfFocus: control.pointsOfFocus,
        currentHeading: target.heading,
        currentBody: target.body,
        evidence,
      }),
      1024,
    );
    if (text) {
      try {
        const parsed = JSON.parse(stripFences(text)) as RawClause;
        regenerated = validateClause(parsed, validIds);
      } catch {
        regenerated = null;
      }
    }
    if (!regenerated) {
      const hasEvidence = control.artifacts.length > 0;
      regenerated = {
        heading: `${control.code} — ${control.title}`,
        body: deterministicClauseBody(control),
        controlCodes: [control.code],
        anchorArtifactIds: hasEvidence ? control.artifacts.map((a) => a.id) : [],
        unanchored: !hasEvidence,
        needsInputReason: hasEvidence
          ? ""
          : "No evidence has been collected for this control yet.",
        editedByHuman: false,
      };
    }
  }

  if (!regenerated) {
    return { ok: false, message: "This clause has no linked control to regenerate from." };
  }

  const nextClauses = clauses.slice();
  nextClauses[clauseIndex] = regenerated;

  const versionId = await writeVersion(
    db,
    organizationId,
    policy,
    {
      title: policy.title,
      summary: ctx.policy.blurb,
      clauses: nextClauses,
      source: "llm_gateway",
      model: drafterModel(),
    },
    ctx.artifactsById,
    userId,
    "drafted",
  );

  return { ok: true, message: "Clause regenerated from evidence.", versionId };
}

/**
 * Apply a human inline edit to a clause, writing a new immutable version and
 * returning the policy to the `drafted` state.
 */
export async function editClause(
  db: RagDb,
  organizationId: string,
  policyKey: string,
  clauseIndex: number,
  newHeading: string,
  newBody: string,
  userId: string,
): Promise<DraftActionResult> {
  const policy = getPolicy(policyKey);
  if (!policy) return { ok: false, message: "Unknown policy." };

  const current = await loadCurrentVersionId(db, organizationId, policyKey);
  if (!current) return { ok: false, message: "No draft to edit yet." };

  const clauses = await loadVersionClauses(db, organizationId, current);
  if (clauseIndex < 0 || clauseIndex >= clauses.length) {
    return { ok: false, message: "Clause not found." };
  }

  const ctx = await assemblePolicyContext(db, organizationId, policyKey);
  const artifactsById = ctx?.artifactsById ?? new Map<string, RedactedArtifact>();

  const target = clauses[clauseIndex]!;
  const heading = newHeading.trim() || target.heading;
  const body = newBody.trim() || target.body;
  const nextClauses = clauses.slice();
  nextClauses[clauseIndex] = {
    ...target,
    heading,
    body,
    editedByHuman: true,
  };

  const versionId = await writeVersion(
    db,
    organizationId,
    policy,
    {
      title: policy.title,
      summary: ctx?.policy.blurb ?? "",
      clauses: nextClauses,
      source: "deterministic_fallback",
      model: null,
    },
    artifactsById,
    userId,
    "drafted",
  );

  return { ok: true, message: "Clause updated.", versionId };
}

/** Move a drafted policy into review. */
export async function submitForReview(
  db: RagDb,
  organizationId: string,
  policyKey: string,
): Promise<DraftActionResult> {
  const rows = await db.query<{ status: string }>(
    `SELECT status FROM soc2_policies WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  const status = rows[0]?.status;
  if (!status) return { ok: false, message: "Draft the policy first." };
  if (status !== "drafted") {
    return { ok: false, message: `Cannot submit for review from '${status}'.` };
  }
  await db.execute(
    `UPDATE soc2_policies
        SET status = 'in_review', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  return { ok: true, message: "Policy submitted for review." };
}

interface ApprovalRow {
  status: string;
  current_version_id: string | null;
}

/**
 * Approve a policy. Enforces the distinct-reviewer rule: the approver must NOT be
 * the drafter of the current version. On approval, every anchored clause's
 * phrasing is stored for recall on future drafts.
 */
export async function approvePolicy(
  db: RagDb,
  organizationId: string,
  policyKey: string,
  approverUserId: string,
): Promise<DraftActionResult> {
  const rows = await db.query<ApprovalRow>(
    `SELECT status, current_version_id
       FROM soc2_policies
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  const policyRow = rows[0];
  if (!policyRow || !policyRow.current_version_id) {
    return { ok: false, message: "Draft and review the policy first." };
  }
  if (policyRow.status !== "in_review") {
    return { ok: false, message: "Submit the policy for review before approving." };
  }

  const versionRows = await db.query<{ drafted_by: string | null }>(
    `SELECT drafted_by FROM soc2_policy_versions WHERE id = $1::uuid`,
    policyRow.current_version_id,
  );
  const draftedBy = versionRows[0]?.drafted_by ?? null;
  if (draftedBy && draftedBy === approverUserId) {
    return {
      ok: false,
      message: "A policy must be approved by a different person than its drafter.",
    };
  }

  await db.execute(
    `UPDATE soc2_policies
        SET status = 'approved',
            reviewed_by = $3::uuid,
            reviewed_at = now(),
            approved_by = $3::uuid,
            approved_at = now(),
            updated_at = now()
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
    approverUserId,
  );

  // Store accepted phrasings (anchored clauses only) for future recall.
  const clauses = await loadVersionClauses(db, organizationId, policyRow.current_version_id);
  for (const clause of clauses) {
    if (clause.unanchored) continue;
    await storeAcceptedPhrasing(db, organizationId, {
      policyKey,
      heading: clause.heading,
      body: clause.body,
      controlCodes: clause.controlCodes,
      acceptedBy: approverUserId,
      versionId: policyRow.current_version_id,
    });
  }

  return { ok: true, message: "Policy approved." };
}

async function loadCurrentVersionId(
  db: RagDb,
  organizationId: string,
  policyKey: string,
): Promise<string | null> {
  const rows = await db.query<{ current_version_id: string | null }>(
    `SELECT current_version_id
       FROM soc2_policies
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  return rows[0]?.current_version_id ?? null;
}

// ─── Read model for the editor page ──────────────────────────────────────────

/** A clause as rendered in the reading column. */
export interface ClauseView {
  readonly index: number;
  readonly heading: string;
  readonly body: string;
  readonly controlCodes: readonly string[];
  readonly unanchored: boolean;
  readonly needsInputReason: string;
  readonly editedByHuman: boolean;
  readonly anchors: readonly ClauseAnchorView[];
}

/** An anchor chip + its rail target. */
export interface ClauseAnchorView {
  readonly artifactId: string;
  readonly label: string;
  readonly snippet: string;
  readonly controlCode: string | null;
}

/** The full editor payload for /policies/[policyId]. */
export interface PolicyEditorData {
  readonly policy: PolicyDescriptor;
  readonly status: string;
  readonly versionNo: number;
  readonly title: string;
  readonly summary: string;
  readonly source: string;
  readonly clauses: readonly ClauseView[];
  readonly rail: readonly RedactedArtifact[];
  readonly totalControls: number;
  readonly controlsWithEvidence: number;
  readonly locked: boolean;
  readonly hasDraft: boolean;
}

interface VersionMetaRow {
  id: string;
  version_no: number | string;
  status: string;
  title: string;
  summary: string;
  source: string;
}

/**
 * Assemble everything the editor page needs: the current version's clauses +
 * anchors, the redacted evidence rail, and the lock/coverage state.
 */
export async function loadPolicyEditor(
  db: RagDb,
  organizationId: string,
  policyKey: string,
): Promise<PolicyEditorData | null> {
  const ctx = await assemblePolicyContext(db, organizationId, policyKey);
  if (!ctx) return null;

  const policyRows = await db.query<{ status: string; current_version_id: string | null }>(
    `SELECT status, current_version_id
       FROM soc2_policies
      WHERE organization_id = $1::uuid AND policy_key = $2`,
    organizationId,
    policyKey,
  );
  const policyRow = policyRows[0];
  const status = policyRow?.status ?? "not_started";
  const currentVersionId = policyRow?.current_version_id ?? null;

  const base = {
    policy: ctx.policy,
    status,
    rail: ctx.artifacts,
    totalControls: ctx.totalControls,
    controlsWithEvidence: ctx.controlsWithEvidence,
    locked: ctx.locked,
  };

  if (!currentVersionId) {
    return {
      ...base,
      versionNo: 0,
      title: ctx.policy.title,
      summary: ctx.policy.blurb,
      source: "",
      clauses: [],
      hasDraft: false,
    };
  }

  const versionRows = await db.query<VersionMetaRow>(
    `SELECT id, version_no, status, title, summary, source
       FROM soc2_policy_versions
      WHERE id = $1::uuid`,
    currentVersionId,
  );
  const version = versionRows[0];

  const clauseRows = await db.query<ClauseRow>(
    `SELECT id, clause_index, heading, body, control_codes, unanchored,
            needs_input_reason, edited_by_human
       FROM soc2_policy_clauses
      WHERE version_id = $1::uuid AND organization_id = $2::uuid
      ORDER BY clause_index ASC`,
    currentVersionId,
    organizationId,
  );
  const anchorRows = await db.query<AnchorRow>(
    `SELECT clause_id, artifact_id, control_code, label, snippet
       FROM soc2_policy_clause_anchors
      WHERE version_id = $1::uuid AND organization_id = $2::uuid`,
    currentVersionId,
    organizationId,
  );
  const anchorsByClause = new Map<string, ClauseAnchorView[]>();
  for (const a of anchorRows) {
    const bucket = anchorsByClause.get(a.clause_id) ?? [];
    bucket.push({
      artifactId: a.artifact_id,
      label: a.label,
      snippet: a.snippet,
      controlCode: a.control_code,
    });
    anchorsByClause.set(a.clause_id, bucket);
  }

  const clauses: ClauseView[] = clauseRows.map((row) => ({
    index: Number(row.clause_index),
    heading: row.heading,
    body: row.body,
    controlCodes: Array.isArray(row.control_codes)
      ? (row.control_codes.filter((c) => typeof c === "string") as string[])
      : [],
    unanchored: row.unanchored,
    needsInputReason: row.needs_input_reason ?? "",
    editedByHuman: row.edited_by_human,
    anchors: anchorsByClause.get(row.id) ?? [],
  }));

  return {
    ...base,
    versionNo: version ? Number(version.version_no) : 0,
    title: version?.title ?? ctx.policy.title,
    summary: version?.summary ?? ctx.policy.blurb,
    source: version?.source ?? "",
    clauses,
    hasDraft: clauses.length > 0,
  };
}
