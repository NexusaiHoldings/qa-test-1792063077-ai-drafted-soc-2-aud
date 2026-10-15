/**
 * Prompt construction for evidence-anchored drafting (F1-007, prompts.ts).
 *
 * The drafter (drafter.ts) feeds these to the Nexus gateway (Claude Sonnet,
 * structured JSON output). The system prompt encodes the two non-negotiable
 * liability rules: the model FLAGS, it never CERTIFIES; and EVERY clause must
 * either anchor to a supplied artifact id or set `unanchored: true` with a
 * `needs_input` reason — no clause may assert a control is satisfied without a
 * retrieved evidence artifact behind it.
 *
 * Pure string builders, no I/O.
 */

import type { RagContext } from "@/lib/soc2/drafting/rag";

/** The structured-output contract shared between the prompt and the parser. */
export const CLAUSE_SCHEMA_HINT = `Respond with ONLY a JSON object of this exact shape:
{
  "title": "<policy title>",
  "summary": "<2-3 sentence scope statement>",
  "clauses": [
    {
      "heading": "<short clause heading>",
      "body": "<the clause text, 2-5 sentences, specific to the supplied evidence>",
      "control_codes": ["CC6.1"],
      "anchor_artifact_ids": ["<an id copied verbatim from the supplied evidence>"],
      "unanchored": false,
      "needs_input": "<empty string, OR a short reason when unanchored is true>"
    }
  ]
}`;

/**
 * The system prompt. Stable across drafts so prompt caching stays warm; all
 * per-policy variation lives in the user prompt.
 */
export function buildDraftSystemPrompt(): string {
  return [
    "You are a SOC 2 policy drafting assistant for a single company.",
    "You DRAFT policy language; you NEVER certify or claim the company is compliant.",
    "Write in calm, plain, auditor-ready English. Avoid marketing tone and hedging.",
    "",
    "HARD RULES:",
    "1. Anchor every clause to the company's ACTUAL evidence. For each clause, set",
    "   anchor_artifact_ids to one or more artifact ids COPIED VERBATIM from the",
    "   supplied evidence. Never invent an id.",
    "2. If a control has NO supplied evidence, you may still draft the clause, but",
    "   you MUST set unanchored=true, leave anchor_artifact_ids empty, and write a",
    "   short needs_input reason stating what the human must supply.",
    "3. Never write that a control is 'compliant', 'passed', or 'certified'. Describe",
    "   what the company DOES, grounded in the evidence.",
    "4. Prefer the company's own prior accepted phrasings when they are provided and",
    "   still fit the evidence.",
    "5. Output VALID JSON only — no prose, no markdown fences.",
    "",
    CLAUSE_SCHEMA_HINT,
  ].join("\n");
}

/** Serialize the controls + redacted evidence for the user prompt. */
function serializeControls(ctx: RagContext): unknown {
  return ctx.controls.map((control) => ({
    control_code: control.code,
    title: control.title,
    criteria_text: control.criteriaText,
    points_of_focus: control.pointsOfFocus,
    status: control.status,
    evidence:
      control.artifacts.length > 0
        ? control.artifacts.map((a) => ({
            artifact_id: a.id,
            provider: a.provider,
            artifact_type: a.artifactType,
            summary: a.summary,
            facts: a.facts,
          }))
        : [],
  }));
}

/** Serialize prior accepted phrasings for reuse. */
function serializePhrasings(ctx: RagContext): unknown {
  return ctx.acceptedPhrasings.map((p) => ({
    heading: p.heading,
    body: p.body,
    control_codes: p.controlCodes,
  }));
}

/**
 * The per-policy user prompt: the policy, its controls with current status, the
 * redacted evidence per control, and prior accepted phrasings to reuse.
 */
export function buildDraftUserPrompt(ctx: RagContext): string {
  const payload = {
    policy: {
      key: ctx.policy.key,
      title: ctx.policy.title,
      description: ctx.policy.blurb,
    },
    instructions:
      "Draft one clause per control below. Anchor each clause to the control's " +
      "evidence artifacts when present; otherwise mark it unanchored with a " +
      "needs_input reason. Keep clauses specific to the facts shown.",
    controls: serializeControls(ctx),
    prior_accepted_phrasings: serializePhrasings(ctx),
  };
  return JSON.stringify(payload, null, 2);
}

/** Context for regenerating a single clause from its control's evidence. */
export interface RegenerateClauseContext {
  readonly policyTitle: string;
  readonly controlCode: string;
  readonly controlTitle: string;
  readonly criteriaText: string;
  readonly pointsOfFocus: readonly string[];
  readonly currentHeading: string;
  readonly currentBody: string;
  readonly evidence: ReadonlyArray<{
    artifact_id: string;
    provider: string;
    artifact_type: string;
    summary: string;
    facts: Record<string, unknown>;
  }>;
}

/** System prompt for single-clause regeneration (same hard rules, one clause). */
export function buildRegenerateSystemPrompt(): string {
  return [
    "You are a SOC 2 policy drafting assistant. Rewrite ONE policy clause,",
    "grounded strictly in the supplied evidence for its control.",
    "You FLAG, you never CERTIFY. Never claim the control is 'compliant'.",
    "If no evidence is supplied, set unanchored=true with a needs_input reason.",
    "",
    'Respond with ONLY a JSON object:',
    '{ "heading": "...", "body": "...", "control_codes": ["..."],',
    '  "anchor_artifact_ids": ["..."], "unanchored": false, "needs_input": "" }',
  ].join("\n");
}

/** User prompt for single-clause regeneration. */
export function buildRegenerateUserPrompt(ctx: RegenerateClauseContext): string {
  return JSON.stringify(
    {
      policy_title: ctx.policyTitle,
      control: {
        control_code: ctx.controlCode,
        title: ctx.controlTitle,
        criteria_text: ctx.criteriaText,
        points_of_focus: ctx.pointsOfFocus,
      },
      current_clause: { heading: ctx.currentHeading, body: ctx.currentBody },
      evidence: ctx.evidence,
      instruction:
        "Rewrite this clause to reflect the evidence precisely. Copy artifact ids " +
        "verbatim into anchor_artifact_ids. If no evidence, mark unanchored.",
    },
    null,
    2,
  );
}
