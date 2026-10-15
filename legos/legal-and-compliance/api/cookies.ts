/**
 * Cookie consent API.
 *
 * Ported 2026-05-12 from api/cookies.py.
 *   POST /api/legal/cookies/consent         — persist consent decision
 *   GET  /api/legal/cookies/consent/current — most recent valid consent
 *
 * Publishes: legal.cookie_consent_given / legal.cookie_consent_declined
 *
 * Anonymous + authenticated paths both supported (cookie banner needs to
 * work for first-time visitors before login).
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const VALID_DECISIONS = new Set(["accepted_all", "rejected_all", "custom"]);
const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year (GDPR best practice)

export interface GiveConsentInput {
  readonly userId: string | null;
  readonly body: {
    decision?: string;
    anonymous_id?: string;
    categories?: Record<string, boolean>;
  };
  readonly anonymousIdHeader: string | null;
  readonly ipAddress: string | null;
  readonly ctx: HandlerContext;
}

export async function handleGiveConsent({
  userId,
  body,
  anonymousIdHeader,
  ipAddress,
  ctx,
}: GiveConsentInput): Promise<HandlerResult> {
  const decision = body.decision;
  if (!decision || !VALID_DECISIONS.has(decision)) {
    return err(
      400,
      `invalid decision; must be one of ${[...VALID_DECISIONS].sort().join(",")}`,
    );
  }

  const anonymousId = body.anonymous_id || anonymousIdHeader;
  if (!userId && !anonymousId) {
    return err(400, "must provide X-User-Id or anonymous_id");
  }

  const categories = body.categories || {};
  const consentId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONSENT_TTL_MS);

  try {
    await ctx.db.execute(
      "INSERT INTO cookie_consents " +
        "(id, user_id, anonymous_id, decision, categories, ip_address, given_at, expires_at) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      consentId,
      userId,
      anonymousId,
      decision,
      JSON.stringify(categories),
      ipAddress,
      now.toISOString(),
      expiresAt.toISOString(),
    );
  } catch {
    return err(500, "internal error");
  }

  const subject =
    decision !== "rejected_all"
      ? "legal.cookie_consent_given"
      : "legal.cookie_consent_declined";
  await ctx.events.publish(subject, {
    consent_id: consentId,
    user_id: userId,
    anonymous_id: anonymousId,
    decision,
  });

  return ok({
    status: "recorded",
    consent_id: consentId,
    decision,
    expires_at: expiresAt.toISOString(),
  });
}

// ── handler: get current consent ───────────────────────────────────────────

export interface GetCurrentConsentInput {
  readonly userId: string | null;
  readonly anonymousIdHeader: string | null;
  readonly ctx: HandlerContext;
}

interface ConsentRow {
  id: string;
  decision: string;
  categories: string | Record<string, unknown>;
  given_at: string;
  expires_at: string;
}

export async function handleGetCurrentConsent({
  userId,
  anonymousIdHeader,
  ctx,
}: GetCurrentConsentInput): Promise<HandlerResult> {
  const nowIso = new Date().toISOString();

  let rows: ConsentRow[] = [];
  try {
    if (userId) {
      rows = await ctx.db.query<ConsentRow>(
        "SELECT id, decision, categories, given_at, expires_at " +
          "FROM cookie_consents WHERE user_id = $1 AND expires_at > $2 " +
          "ORDER BY given_at DESC LIMIT 1",
        userId,
        nowIso,
      );
    } else if (anonymousIdHeader) {
      rows = await ctx.db.query<ConsentRow>(
        "SELECT id, decision, categories, given_at, expires_at " +
          "FROM cookie_consents WHERE anonymous_id = $1 AND expires_at > $2 " +
          "ORDER BY given_at DESC LIMIT 1",
        anonymousIdHeader,
        nowIso,
      );
    }
  } catch {
    return err(500, "internal error");
  }

  if (rows.length === 0) {
    return ok({
      consent: null,
      default: "rejected_all",
      note: "EU-safe default: no consent on file",
    });
  }

  const r = rows[0];
  let categories: Record<string, unknown> = {};
  if (typeof r.categories === "string") {
    try {
      categories = JSON.parse(r.categories);
    } catch {
      categories = {};
    }
  } else {
    categories = r.categories;
  }

  return ok({
    consent: {
      id: r.id,
      decision: r.decision,
      categories,
      given_at: r.given_at,
      expires_at: r.expires_at,
    },
  });
}
