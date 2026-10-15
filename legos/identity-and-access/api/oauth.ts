/**
 * OAuth provider handlers — Google + GitHub.
 *
 * Ported 2026-05-12 from api/oauth.py.
 *   - GET  oauth/{provider}/start    → 302 to provider authorize URL
 *   - GET  oauth/{provider}/callback → exchange code, issue session
 *
 * State store is in-memory (single-instance). 5-minute TTL. Multi-instance
 * deploys should swap to a shared store in a future sprint.
 *
 * Stub mode: when env OAUTH_STUB_MODE=true, /start redirects directly to
 * /callback?code=stub_code&state=... — useful for local dev and tests.
 */

import { randomUUID } from "node:crypto";

import { randomTokenUrlsafe, sha256Hex } from "./_lib/crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const PROVIDERS = ["google", "github"] as const;
type Provider = (typeof PROVIDERS)[number];

const STATE_TTL_MS = 5 * 60_000;
const oauthStates = new Map<string, { provider: Provider; expiresAt: number }>();

interface ProviderUrls {
  readonly authorize: string;
  readonly token: string;
  readonly userinfo: string;
  readonly scope: string;
}

const URLS: Record<Provider, ProviderUrls> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user",
    scope: "read:user user:email",
  },
};

function pruneStates(): void {
  const now = Date.now();
  for (const [k, v] of oauthStates) {
    if (v.expiresAt < now) oauthStates.delete(k);
  }
}

function isProvider(s: string): s is Provider {
  return (PROVIDERS as readonly string[]).includes(s);
}

export interface OauthConfig {
  readonly google?: { client_id?: string; client_secret?: string };
  readonly github?: { client_id?: string; client_secret?: string };
}

function getCreds(
  provider: Provider,
  legoConfig: OauthConfig | undefined,
): { clientId: string; clientSecret: string } | null {
  const cfg = legoConfig?.[provider];
  const envPrefix = provider.toUpperCase();
  const clientId =
    cfg?.client_id || process.env[`${envPrefix}_OAUTH_CLIENT_ID`] || "";
  const clientSecret =
    cfg?.client_secret || process.env[`${envPrefix}_OAUTH_CLIENT_SECRET`] || "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// ── handler: start (returns a redirect URL — substrate translates to 302) ──

export interface OauthStartInput {
  readonly provider: string;
  readonly baseUrl: string;
  readonly legoConfig?: OauthConfig;
}

export interface OauthStartResult {
  readonly redirectTo: string;
  readonly status: 302 | 400 | 404 | 503;
}

export function handleOauthStart({
  provider,
  baseUrl,
  legoConfig,
}: OauthStartInput): OauthStartResult {
  if (!isProvider(provider)) {
    return { redirectTo: "", status: 404 };
  }
  pruneStates();
  const state = randomTokenUrlsafe(32);
  oauthStates.set(state, {
    provider,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  if (process.env.OAUTH_STUB_MODE?.toLowerCase() === "true") {
    return {
      redirectTo: `/api/auth/oauth/${provider}/callback?code=stub_code&state=${state}`,
      status: 302,
    };
  }

  const creds = getCreds(provider, legoConfig);
  if (!creds) return { redirectTo: "", status: 503 };

  const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;
  const scope = encodeURIComponent(URLS[provider].scope);
  const url =
    `${URLS[provider].authorize}` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(creds.clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${state}`;
  return { redirectTo: url, status: 302 };
}

// ── helper: exchange auth code for profile ─────────────────────────────────

async function exchangeCode(
  provider: Provider,
  code: string,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<Record<string, unknown> | null> {
  const redirectUri = `${baseUrl}/api/auth/oauth/${provider}/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  if (provider === "google") params.set("grant_type", "authorization_code");

  try {
    const tokenRes = await fetch(URLS[provider].token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) return null;
    const tokenJson = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenJson.access_token as string | undefined;
    if (!accessToken) return null;

    const userRes = await fetch(URLS[provider].userinfo, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return null;
    return (await userRes.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── handler: callback (issues session) ─────────────────────────────────────

export interface OauthCallbackInput {
  readonly provider: string;
  readonly code: string;
  readonly state: string;
  readonly errorParam?: string;
  readonly baseUrl: string;
  readonly legoConfig?: OauthConfig;
  readonly ctx: HandlerContext;
}

export async function handleOauthCallback({
  provider,
  code,
  state,
  errorParam,
  baseUrl,
  legoConfig,
  ctx,
}: OauthCallbackInput): Promise<HandlerResult> {
  if (!isProvider(provider)) return err(404, "unknown provider");
  if (errorParam) return err(400, `OAuth error: ${errorParam}`);

  pruneStates();
  const stored = oauthStates.get(state);
  oauthStates.delete(state);
  if (!stored || stored.provider !== provider || stored.expiresAt < Date.now()) {
    return err(400, "invalid or expired state parameter");
  }

  const stubMode = process.env.OAUTH_STUB_MODE?.toLowerCase() === "true";
  let profile: Record<string, unknown>;

  if (stubMode && code === "stub_code") {
    profile = {
      id: "stub_id",
      sub: "stub_id",
      email: "stub@example.com",
      login: "stub",
    };
  } else {
    const creds = getCreds(provider, legoConfig);
    if (!creds) return err(503, `${provider} OAuth not configured`);
    const result = await exchangeCode(
      provider,
      code,
      creds.clientId,
      creds.clientSecret,
      baseUrl,
    );
    if (!result) return err(400, "OAuth exchange failed");
    profile = result;
  }

  const providerUserId = String(profile.id || profile.sub || "");
  const email = String(profile.email || "");
  if (!providerUserId) return err(400, "provider returned no user id");

  try {
    const existingIdentity = await ctx.db.query<{ user_id: string }>(
      "SELECT user_id FROM oauth_identities WHERE provider=$1 AND provider_user_id=$2 LIMIT 1",
      provider,
      providerUserId,
    );

    let userId: string;
    let eventName: string;
    if (existingIdentity.length > 0) {
      userId = existingIdentity[0].user_id;
      eventName = "user.oauth_login";
    } else {
      const matchingUsers = email
        ? await ctx.db.query<{ id: string }>(
            "SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
            email,
          )
        : [];
      if (matchingUsers.length > 0) {
        userId = matchingUsers[0].id;
        eventName = "user.oauth_login";
      } else {
        userId = randomUUID();
        eventName = "user.oauth_signup";
        await ctx.db.execute(
          "INSERT INTO users (id, email, password_hash, status) VALUES ($1::uuid, $2, '', 'active')",
          userId,
          email || `oauth_${provider}_${providerUserId}@noemail.local`,
        );
      }
      await ctx.db.execute(
        "INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, email, profile_data) " +
          "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)",
        randomUUID(),
        userId,
        provider,
        providerUserId,
        email || null,
        JSON.stringify(profile),
      );
    }

    const token = randomTokenUrlsafe(32);
    await ctx.db.execute(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) " +
        "VALUES ($1::uuid, $2::uuid, $3, NOW() + INTERVAL '30 days')",
      randomUUID(),
      userId,
      sha256Hex(token),
    );

    await ctx.events.publish(eventName, { user_id: userId, provider });
    return ok({ session_token: token, user_id: userId });
  } catch {
    return err(500, "internal error");
  }
}
