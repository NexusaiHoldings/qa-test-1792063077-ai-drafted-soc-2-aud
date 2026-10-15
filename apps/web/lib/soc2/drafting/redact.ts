/**
 * Evidence redaction (F1-007, redact.ts).
 *
 * Before a soc2_evidence_artifacts row is placed into a drafting prompt (or shown
 * in the evidence rail), it is reduced to a SHORT, SECRET-FREE summary. The
 * liability_assessor demands "zero-retention architecture for ingested
 * credentials" and names "source code and IP exposure" as a vector, so we never
 * forward raw artifact JSON to the gateway: we strip anything that looks like a
 * secret, truncate long values, and emit a compact human-readable summary.
 *
 * Pure functions, no I/O.
 */

/** Patterns that, when matched anywhere in a string, mark it as a likely secret. */
const SECRET_KEY_HINTS = [
  "secret",
  "password",
  "passwd",
  "token",
  "credential",
  "private_key",
  "privatekey",
  "api_key",
  "apikey",
  "access_key",
  "accesskey",
  "session",
  "authorization",
  "signature",
  "client_secret",
];

/** Value-shaped patterns we always mask, regardless of the key name. */
const VALUE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /AKIA[0-9A-Z]{12,}/g, label: "[redacted-aws-access-key]" },
  { re: /ASIA[0-9A-Z]{12,}/g, label: "[redacted-aws-temp-key]" },
  { re: /ghp_[0-9A-Za-z]{20,}/g, label: "[redacted-github-token]" },
  { re: /gho_[0-9A-Za-z]{20,}/g, label: "[redacted-github-token]" },
  { re: /xox[baprs]-[0-9A-Za-z-]{10,}/g, label: "[redacted-slack-token]" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: "[redacted-private-key]" },
  { re: /eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}/g, label: "[redacted-jwt]" },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: "[redacted-email]" },
  { re: /\b\d{12}\b/g, label: "[redacted-account-id]" },
];

const MAX_VALUE_LENGTH = 160;
const MAX_SUMMARY_FIELDS = 8;

/** True when a key name suggests its value is a secret. */
function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_HINTS.some((hint) => lower.includes(hint));
}

/** Mask secret-shaped substrings and truncate overly long text. */
export function redactText(input: string): string {
  let out = input;
  for (const { re, label } of VALUE_PATTERNS) {
    out = out.replace(re, label);
  }
  if (out.length > MAX_VALUE_LENGTH) {
    out = `${out.slice(0, MAX_VALUE_LENGTH)}…`;
  }
  return out;
}

/**
 * Recursively redact a JSON value: secret-named keys are dropped, string values
 * are pattern-scrubbed and truncated, arrays are capped. Returns a structurally
 * similar but secret-free value suitable for a prompt.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[nested]";

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redactValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactValue(raw, depth + 1);
    }
    return out;
  }

  return "[unsupported]";
}

/** A redacted, prompt-safe view of one evidence artifact. */
export interface RedactedArtifact {
  readonly id: string;
  readonly provider: string;
  readonly artifactType: string;
  readonly externalId: string | null;
  readonly collectedAt: string | null;
  /** A one-line human summary for the evidence rail. */
  readonly summary: string;
  /** The redacted key/value facts the drafter may cite. */
  readonly facts: Record<string, unknown>;
}

/** Shape of a raw artifact row as read from the DB. */
export interface RawArtifact {
  readonly id: string;
  readonly provider: string;
  readonly artifactType: string;
  readonly externalId: string | null;
  readonly collectedAt: string | null;
  readonly data: Record<string, unknown>;
}

/** Humanize an artifact_type / snake_case key for display. */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Build a compact one-line summary from the redacted facts: the first few
 * scalar fields rendered as "Key: value" pairs. Falls back to the artifact type.
 */
function buildSummary(artifactType: string, facts: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(facts)) {
    if (parts.length >= 3) break;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    parts.push(`${humanizeKey(key)}: ${String(value)}`);
  }
  if (parts.length === 0) return humanizeKey(artifactType);
  return parts.join(" · ");
}

/**
 * Redact a raw artifact into a prompt-safe summary. Keeps at most
 * MAX_SUMMARY_FIELDS top-level facts so prompts stay small and focused.
 */
export function redactArtifact(raw: RawArtifact): RedactedArtifact {
  const redactedData = redactValue(raw.data) as Record<string, unknown>;
  const facts: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(redactedData)) {
    if (count >= MAX_SUMMARY_FIELDS) break;
    if (isSecretKey(key)) continue;
    facts[key] = value;
    count += 1;
  }
  return {
    id: raw.id,
    provider: raw.provider,
    artifactType: raw.artifactType,
    externalId: raw.externalId ? redactText(raw.externalId) : null,
    collectedAt: raw.collectedAt,
    summary: buildSummary(raw.artifactType, facts),
    facts,
  };
}
