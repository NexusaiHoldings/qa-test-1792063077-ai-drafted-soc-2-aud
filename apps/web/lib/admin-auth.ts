/**
 * Admin authorization for the substrate admin console.
 *
 * Sprint substrate-admin-surface-001 (2026-06-01).
 *
 * The @nexus/admin-console lego gates its handlers on a static X-Admin-Token.
 * The substrate instead authorizes by SESSION USER: a logged-in user whose
 * email is in the ADMIN_EMAILS allow-list is an admin. The lego's static token
 * is supplied server-side (adminToken()) so checkAdminAuth passes — it is NEVER
 * sent to the browser. The real gate is getAdminUser().
 *
 * ADMIN_EMAILS  — comma-separated allow-list (default: admintest@nexusaiholdings.com)
 * ADMIN_TOKEN   — internal token for the lego's checkAdminAuth (falls back to
 *                 SETUP_SECRET, then a constant; value is irrelevant since the
 *                 shim passes it as both header and expected token).
 */

import { cookies } from "next/headers";
import { handleSession } from "@nexus/identity-and-access";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

export interface AdminUser {
  id: string;
  email: string;
}

export type SessionUser = AdminUser;

/** Allow-listed admin emails (lowercased). */
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "admintest@nexusaiholdings.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Internal token handed to the lego's checkAdminAuth (server-side only). */
export function adminToken(): string {
  return (
    process.env.ADMIN_TOKEN ||
    process.env.SETUP_SECRET ||
    "substrate-admin-internal"
  );
}

/** True if the email is allow-listed as an admin. */
export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Allow-listed chairman emails (lowercased) — the admins permitted to approve
 * HIGH-RISK feedback Builds (auth/billing/data-model/infra). feedback-to-build-
 * loop-001. Defaults to the admin allow-list so single-admin incubating
 * companies aren't deadlocked (the sole admin IS the chairman); set
 * CHAIRMAN_EMAILS to a narrower list to restrict high-risk approval.
 */
export function chairmanEmails(): string[] {
  const raw = process.env.CHAIRMAN_EMAILS;
  if (!raw || !raw.trim()) return adminEmails();
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** True if the email may approve high-risk feedback Builds. */
export function isChairmanEmail(email: string): boolean {
  return chairmanEmails().includes(email.toLowerCase());
}

/**
 * Resolve the current session user (any role), or null. Returns null with NO
 * DB hit when there is no session cookie (anonymous traffic); otherwise
 * validates the session via the identity lego.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get("session_token")?.value;
  if (!token) return null;

  let result;
  try {
    result = await handleSession({
      authorizationHeader: `Bearer ${token}`,
      ctx: { db: buildDb(), events: buildEventBus() },
    });
  } catch {
    return null;
  }

  if (result.status !== 200 || typeof result.body !== "object" || result.body === null) {
    return null;
  }
  const body = result.body as { user_id?: string; email?: string };
  if (!body.email) return null;
  return { id: body.user_id ?? "", email: body.email };
}

/**
 * Resolve the current session user and return it only if it is an admin.
 * Returns null for anonymous, invalid sessions, or non-allow-listed users.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
