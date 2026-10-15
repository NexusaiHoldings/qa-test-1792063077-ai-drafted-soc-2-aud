/**
 * Deterministic evidence-mapping rules (F1-005, rules.ts).
 *
 * The mapper (apps/web/lib/soc2/mapper.ts) runs these rules FIRST and only falls
 * back to the gateway LLM for artifacts no rule can decide. A rule is a pure,
 * auditable function over a single ingested artifact that yields a control
 * mapping with a human-readable rationale — e.g.
 *
 *     cloudtrail.multi_region === true  →  CC7.2 evidence_found
 *
 * Determinism is the structural mitigation for the "LLM hallucination"
 * feasibility risk: whenever a rule can decide, no model is involved at all, and
 * the result cites the exact artifact that triggered it.
 *
 * A rule NEVER emits 'compliant' — only evidence_found | gap |
 * needs_human_review | not_applicable_claimed (the agent flags, it does not
 * certify), and an `evidence_found` outcome always rides on the triggering
 * artifact's id (no citation, no evidence_found).
 */

/** The only statuses the mapper may ever emit. 'compliant' is deliberately absent. */
export type MappingStatus =
  | "evidence_found"
  | "gap"
  | "needs_human_review"
  | "not_applicable_claimed";

/** An ingested, read-only infrastructure artifact (a soc2_evidence_artifacts row). */
export interface EvidenceArtifact {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: string;
  readonly artifactType: string;
  readonly externalId?: string | null;
  readonly data: Record<string, unknown>;
}

/** The outcome of evaluating one rule against one artifact. */
export interface RuleOutcome {
  readonly controlCode: string;
  readonly status: MappingStatus;
  readonly rationale: string;
  readonly confidence: number;
}

/** A single deterministic rule. */
export interface DeterministicRule {
  readonly id: string;
  /** Which artifact type this rule inspects. */
  readonly artifactType: string;
  /** The control this rule produces evidence for. */
  readonly controlCode: string;
  /**
   * Evaluate the artifact's data. Return a RuleOutcome when the rule decides,
   * or null to abstain (let another rule or the LLM fallback handle it).
   */
  readonly evaluate: (artifact: EvidenceArtifact) => RuleOutcome | null;
}

/** Safely read a boolean-ish field from artifact data. */
function readBool(data: Record<string, unknown>, key: string): boolean | undefined {
  const raw = data[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const lowered = raw.trim().toLowerCase();
    if (lowered === "true" || lowered === "enabled" || lowered === "yes") return true;
    if (lowered === "false" || lowered === "disabled" || lowered === "no") return false;
  }
  return undefined;
}

/** Safely read a finite number from artifact data. */
function readNumber(data: Record<string, unknown>, key: string): number | undefined {
  const raw = data[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return undefined;
}

/** Build an `evidence_found` outcome. */
function found(controlCode: string, rationale: string, confidence = 1): RuleOutcome {
  return { controlCode, status: "evidence_found", rationale, confidence };
}

/** Build a `gap` outcome. */
function gap(controlCode: string, rationale: string, confidence = 1): RuleOutcome {
  return { controlCode, status: "gap", rationale, confidence };
}

/**
 * The deterministic rule set. Each inspects exactly one artifact type and maps a
 * concrete configuration fact to a Trust Services criterion.
 */
export const DETERMINISTIC_RULES: readonly DeterministicRule[] = [
  // CloudTrail multi-region → CC7.2 (monitor audit trails across all regions).
  {
    id: "cloudtrail.multi_region",
    artifactType: "cloudtrail",
    controlCode: "CC7.2",
    evaluate: (artifact) => {
      const multiRegion = readBool(artifact.data, "multi_region");
      const logging = readBool(artifact.data, "is_logging");
      if (multiRegion === true && logging !== false) {
        return found(
          "CC7.2",
          "CloudTrail is enabled across all regions (multi_region=true), providing an organization-wide audit trail for anomaly detection.",
        );
      }
      if (multiRegion === false) {
        return gap(
          "CC7.2",
          "CloudTrail is not multi-region (multi_region=false); events in unmonitored regions would not be captured for anomaly detection.",
        );
      }
      return null;
    },
  },
  // GuardDuty enabled → CC7.2 anomaly detection tooling present.
  {
    id: "guardduty.enabled",
    artifactType: "guardduty",
    controlCode: "CC7.2",
    evaluate: (artifact) => {
      const enabled = readBool(artifact.data, "enabled");
      if (enabled === true) {
        return found(
          "CC7.2",
          "Amazon GuardDuty is enabled, continuously monitoring for anomalous and malicious activity.",
        );
      }
      if (enabled === false) {
        return gap("CC7.2", "GuardDuty is disabled; no managed threat-detection monitoring is in place.");
      }
      return null;
    },
  },
  // GuardDuty enabled → CC6.8 malicious software detection.
  {
    id: "guardduty.malware",
    artifactType: "guardduty",
    controlCode: "CC6.8",
    evaluate: (artifact) => {
      const enabled = readBool(artifact.data, "enabled");
      if (enabled === true) {
        return found(
          "CC6.8",
          "GuardDuty threat detection is active, providing detection of unauthorized or malicious software activity.",
        );
      }
      return null;
    },
  },
  // AWS Config recorder on → CC7.1 configuration monitoring.
  {
    id: "aws_config.recorder",
    artifactType: "aws_config",
    controlCode: "CC7.1",
    evaluate: (artifact) => {
      const recording = readBool(artifact.data, "recording");
      if (recording === true) {
        return found(
          "CC7.1",
          "AWS Config recorder is active, tracking configuration changes against a baseline to surface new vulnerabilities.",
        );
      }
      if (recording === false) {
        return gap("CC7.1", "AWS Config recorder is off; configuration drift is not monitored.");
      }
      return null;
    },
  },
  // IAM account password policy strength → CC6.1 logical access.
  {
    id: "iam_password_policy.strength",
    artifactType: "iam_password_policy",
    controlCode: "CC6.1",
    evaluate: (artifact) => {
      const minLength = readNumber(artifact.data, "minimum_password_length");
      const requireSymbols = readBool(artifact.data, "require_symbols");
      if (minLength !== undefined && minLength >= 14 && requireSymbols !== false) {
        return found(
          "CC6.1",
          `The IAM password policy enforces a minimum length of ${minLength} with complexity requirements, supporting strong authentication over protected assets.`,
        );
      }
      if (minLength !== undefined && minLength < 14) {
        return gap(
          "CC6.1",
          `The IAM password policy minimum length is ${minLength}, below the recommended 14 characters.`,
        );
      }
      return null;
    },
  },
  // IAM MFA coverage → CC6.6 boundary protection / credential protection.
  {
    id: "iam_mfa.coverage",
    artifactType: "iam_mfa",
    controlCode: "CC6.6",
    evaluate: (artifact) => {
      const total = readNumber(artifact.data, "total_users");
      const withMfa = readNumber(artifact.data, "users_with_mfa");
      if (total !== undefined && withMfa !== undefined && total > 0) {
        if (withMfa >= total) {
          return found(
            "CC6.6",
            `All ${total} IAM users have MFA enabled, protecting authentication credentials against external threats.`,
          );
        }
        return gap(
          "CC6.6",
          `${total - withMfa} of ${total} IAM users lack MFA; those credentials are exposed to external threats.`,
        );
      }
      return null;
    },
  },
  // S3 account-level public access block → C1.1 / CC6.6 confidentiality.
  {
    id: "s3_public_access.block",
    artifactType: "s3_public_access",
    controlCode: "C1.1",
    evaluate: (artifact) => {
      const blocked = readBool(artifact.data, "block_public_access");
      if (blocked === true) {
        return found(
          "C1.1",
          "S3 account-level Block Public Access is fully enabled, preventing inadvertent public exposure of confidential data.",
        );
      }
      if (blocked === false) {
        return gap(
          "C1.1",
          "S3 Block Public Access is not fully enabled; buckets could expose confidential data publicly.",
        );
      }
      return null;
    },
  },
  // RDS encryption at rest → CC6.1 protection of information assets.
  {
    id: "rds_encryption.at_rest",
    artifactType: "rds_encryption",
    controlCode: "CC6.1",
    evaluate: (artifact) => {
      const encrypted = readBool(artifact.data, "storage_encrypted");
      if (encrypted === true) {
        return found("CC6.1", "RDS storage encryption at rest is enabled across database instances.");
      }
      if (encrypted === false) {
        return gap("CC6.1", "One or more RDS instances are not encrypted at rest.");
      }
      return null;
    },
  },
  // RDS automated backups → A1.2 backup infrastructure.
  {
    id: "rds_backups.retention",
    artifactType: "rds_backups",
    controlCode: "A1.2",
    evaluate: (artifact) => {
      const retentionDays = readNumber(artifact.data, "backup_retention_days");
      if (retentionDays !== undefined && retentionDays >= 7) {
        return found(
          "A1.2",
          `Automated RDS backups are retained for ${retentionDays} days, supporting data recovery objectives.`,
        );
      }
      if (retentionDays !== undefined && retentionDays < 7) {
        return gap(
          "A1.2",
          `RDS automated backup retention is ${retentionDays} days, below the recommended 7-day minimum.`,
        );
      }
      return null;
    },
  },
  // GitHub branch protection → CC8.1 change management.
  {
    id: "github_branch_protection.enabled",
    artifactType: "github_branch_protection",
    controlCode: "CC8.1",
    evaluate: (artifact) => {
      const protectedBranch = readBool(artifact.data, "protected");
      if (protectedBranch === true) {
        return found(
          "CC8.1",
          "The default branch is protected, enforcing a controlled change path into production.",
        );
      }
      if (protectedBranch === false) {
        return gap(
          "CC8.1",
          "The default branch is unprotected; changes can be pushed directly without controls.",
        );
      }
      return null;
    },
  },
  // GitHub required reviews → CC8.1 peer review of changes.
  {
    id: "github_required_reviews.count",
    artifactType: "github_required_reviews",
    controlCode: "CC8.1",
    evaluate: (artifact) => {
      const required = readNumber(artifact.data, "required_approving_review_count");
      if (required !== undefined && required >= 1) {
        return found(
          "CC8.1",
          `Pull requests require at least ${required} approving review(s) before merge, evidencing peer-reviewed change management.`,
        );
      }
      if (required === 0) {
        return gap("CC8.1", "No approving reviews are required before merging changes.");
      }
      return null;
    },
  },
  // GitHub org-wide 2FA → CC6.6 credential protection.
  {
    id: "github_org_2fa.required",
    artifactType: "github_org_2fa",
    controlCode: "CC6.6",
    evaluate: (artifact) => {
      const required = readBool(artifact.data, "two_factor_requirement_enabled");
      if (required === true) {
        return found(
          "CC6.6",
          "Two-factor authentication is enforced org-wide on GitHub, protecting source-control credentials.",
        );
      }
      if (required === false) {
        return gap("CC6.6", "Org-wide 2FA is not enforced on GitHub; member accounts can lack a second factor.");
      }
      return null;
    },
  },
  // Dependabot alerts → CC6.8 / CC7.1 vulnerability detection.
  {
    id: "github_dependabot.enabled",
    artifactType: "github_dependabot",
    controlCode: "CC7.1",
    evaluate: (artifact) => {
      const enabled = readBool(artifact.data, "alerts_enabled");
      if (enabled === true) {
        return found(
          "CC7.1",
          "Dependabot vulnerability alerts are enabled, surfacing newly discovered vulnerabilities in dependencies.",
        );
      }
      if (enabled === false) {
        return gap("CC7.1", "Dependabot alerts are disabled; vulnerable dependencies may go undetected.");
      }
      return null;
    },
  },
  // KMS key rotation → CC6.1 encryption key management.
  {
    id: "kms_keys.rotation",
    artifactType: "kms_keys",
    controlCode: "CC6.1",
    evaluate: (artifact) => {
      const rotation = readBool(artifact.data, "rotation_enabled");
      if (rotation === true) {
        return found(
          "CC6.1",
          "Automatic annual key rotation is enabled on KMS customer-managed keys, protecting encryption keys over their lifecycle.",
        );
      }
      if (rotation === false) {
        return gap("CC6.1", "KMS key rotation is disabled on one or more customer-managed keys.");
      }
      return null;
    },
  },
  // HRIS offboarding timeliness → CC6.2 access removal.
  {
    id: "hris_offboarding.access_removed",
    artifactType: "hris_offboarding",
    controlCode: "CC6.2",
    evaluate: (artifact) => {
      const openTerminated = readNumber(artifact.data, "terminated_with_active_access");
      if (openTerminated === 0) {
        return found(
          "CC6.2",
          "No terminated personnel retain active system access, evidencing timely deprovisioning.",
        );
      }
      if (openTerminated !== undefined && openTerminated > 0) {
        return gap(
          "CC6.2",
          `${openTerminated} terminated personnel still hold active access; deprovisioning is incomplete.`,
        );
      }
      return null;
    },
  },
];

/** Rules keyed by artifact type for O(1) lookup during mapping. */
const RULES_BY_ARTIFACT_TYPE: Map<string, DeterministicRule[]> = (() => {
  const map = new Map<string, DeterministicRule[]>();
  for (const rule of DETERMINISTIC_RULES) {
    const bucket = map.get(rule.artifactType) ?? [];
    bucket.push(rule);
    map.set(rule.artifactType, bucket);
  }
  return map;
})();

/** Result of evaluating all applicable rules against one artifact. */
export interface RuleMatch {
  readonly ruleId: string;
  readonly outcome: RuleOutcome;
}

/**
 * Evaluate every rule registered for the artifact's type. Returns all deciding
 * matches (an artifact can evidence several controls). Empty array means no rule
 * could decide → the mapper escalates to the LLM fallback.
 */
export function evaluateRules(artifact: EvidenceArtifact): RuleMatch[] {
  const rules = RULES_BY_ARTIFACT_TYPE.get(artifact.artifactType) ?? [];
  const matches: RuleMatch[] = [];
  for (const rule of rules) {
    const outcome = rule.evaluate(artifact);
    if (outcome) {
      matches.push({ ruleId: rule.id, outcome });
    }
  }
  return matches;
}

/** True when at least one deterministic rule is registered for the artifact type. */
export function hasRuleFor(artifactType: string): boolean {
  return RULES_BY_ARTIFACT_TYPE.has(artifactType);
}
