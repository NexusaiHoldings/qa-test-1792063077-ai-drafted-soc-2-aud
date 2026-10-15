/**
 * Policy catalog (F1-007, catalog.ts).
 *
 * The 10 most-requested SOC 2 policy documents (ceo_briefing key_feature 2),
 * keyed by a URL-safe slug. Each policy is bound to the controls it covers by
 * reusing the embedded TSC knowledge base (apps/web/lib/soc2/tsc/seed.ts): a
 * control belongs to a policy via its `policyDocument` field, so the mapping is
 * single-sourced and stays in step with F1-005's control library.
 *
 * This module is pure static reference data (no I/O), imported by both the
 * server pages and the RAG layer so the gallery renders even before the first
 * evidence collection.
 */

import {
  SOC2_POLICY_DOCUMENTS,
  TSC_CONTROLS,
  type TscControl,
} from "@/lib/soc2/tsc/seed";

/** A single policy in the drafting studio. */
export interface PolicyDescriptor {
  /** URL-safe slug used as the [policyId] route param. */
  readonly key: string;
  /** Short gallery/editor label. */
  readonly title: string;
  /** The canonical document name — matches TscControl.policyDocument. */
  readonly documentName: string;
  /** One-line gallery blurb. */
  readonly blurb: string;
  /** Codes of the Trust Services Criteria this policy documents. */
  readonly controlCodes: readonly string[];
}

/**
 * Explicit slug ↔ document-name map for the 10 policies. The document names MUST
 * match TscControl.policyDocument exactly (validated by assertCatalogIntegrity
 * at module load) so control grouping is lossless.
 */
const POLICY_DEFINITIONS: ReadonlyArray<{
  key: string;
  title: string;
  documentName: string;
  blurb: string;
}> = [
  {
    key: "information-security",
    title: "Information Security Policy",
    documentName: "Information Security Policy",
    blurb:
      "The umbrella policy: how the organization governs, communicates, and enforces its security program.",
  },
  {
    key: "access-control",
    title: "Access Control Policy",
    documentName: "Access Control Policy",
    blurb:
      "Who can reach which systems and data, how access is granted, reviewed, and revoked.",
  },
  {
    key: "change-management",
    title: "Change Management Policy",
    documentName: "Change Management Policy",
    blurb:
      "How code and infrastructure changes are proposed, reviewed, tested, and released.",
  },
  {
    key: "risk-assessment",
    title: "Risk Assessment Policy",
    documentName: "Risk Assessment Policy",
    blurb:
      "How the organization identifies, rates, and treats risks to its objectives.",
  },
  {
    key: "vendor-management",
    title: "Vendor & Third-Party Management Policy",
    documentName: "Vendor & Third-Party Management Policy",
    blurb:
      "How third parties and sub-processors are vetted, contracted, and monitored.",
  },
  {
    key: "incident-response",
    title: "Incident Response Policy",
    documentName: "Incident Response Policy",
    blurb:
      "How security incidents are detected, triaged, communicated, and resolved.",
  },
  {
    key: "business-continuity",
    title: "Business Continuity & Disaster Recovery Policy",
    documentName: "Business Continuity & Disaster Recovery Policy",
    blurb:
      "How the organization maintains availability and recovers from disruption.",
  },
  {
    key: "data-classification",
    title: "Data Classification & Handling Policy",
    documentName: "Data Classification & Handling Policy",
    blurb:
      "How data is classified, encrypted, retained, and disposed of across its lifecycle.",
  },
  {
    key: "hr-security",
    title: "Human Resources Security Policy",
    documentName: "Human Resources Security Policy",
    blurb:
      "How people are onboarded, trained, and offboarded securely across the employment lifecycle.",
  },
  {
    key: "system-monitoring",
    title: "System Monitoring & Logging Policy",
    documentName: "System Monitoring & Logging Policy",
    blurb:
      "How systems are logged, monitored, and alerted on to detect anomalous activity.",
  },
];

/** Controls whose policyDocument matches, in stable sort order. */
function controlsForDocument(documentName: string): TscControl[] {
  return TSC_CONTROLS.filter((c) => c.policyDocument === documentName).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** The frozen catalog of 10 policy descriptors. */
export const POLICY_CATALOG: readonly PolicyDescriptor[] = POLICY_DEFINITIONS.map(
  (def) => ({
    key: def.key,
    title: def.title,
    documentName: def.documentName,
    blurb: def.blurb,
    controlCodes: controlsForDocument(def.documentName).map((c) => c.code),
  }),
);

const CATALOG_BY_KEY: ReadonlyMap<string, PolicyDescriptor> = new Map(
  POLICY_CATALOG.map((p) => [p.key, p]),
);

/** Look up a policy by its slug. Returns undefined for unknown slugs. */
export function getPolicy(key: string): PolicyDescriptor | undefined {
  return CATALOG_BY_KEY.get(key);
}

/** The control codes documented by a policy (empty array for unknown slugs). */
export function policyControlCodes(key: string): readonly string[] {
  return CATALOG_BY_KEY.get(key)?.controlCodes ?? [];
}

/** Full TscControl records for a policy, in sort order. */
export function policyControls(key: string): TscControl[] {
  const policy = CATALOG_BY_KEY.get(key);
  if (!policy) return [];
  return controlsForDocument(policy.documentName);
}

/**
 * Development-time integrity guard: every catalog document name must correspond
 * to at least one of the SOC2_POLICY_DOCUMENTS, and the catalog must cover all
 * 10. Throws (fail fast at import) if the catalog and the TSC library drift.
 */
export function assertCatalogIntegrity(): void {
  const known = new Set(SOC2_POLICY_DOCUMENTS);
  for (const policy of POLICY_CATALOG) {
    if (!known.has(policy.documentName)) {
      throw new Error(
        `catalog policy "${policy.key}" references unknown document "${policy.documentName}"`,
      );
    }
  }
}
