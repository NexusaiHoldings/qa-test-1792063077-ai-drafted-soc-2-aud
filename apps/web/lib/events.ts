/**
 * Substrate EventBus adapter — implements @nexus/identity-and-access's
 * EventBus interface (and any other lego that emits events).
 *
 * Sprint substrate-auth-routes-001 (2026-05-21); reset-email wiring (2026-06-01).
 *
 * Phase 1: logs every event. Additionally, it delivers the transactional
 * emails the legos depend on by publishing — currently the password-reset
 * link (user.password_reset_requested) via Resend. Sending is best-effort and
 * NEVER throws (the EventBus contract is fire-and-forget): if RESEND_API_KEY or
 * a base URL is missing it logs and skips, so builds/runtime never fail on it.
 */

import type { EventBus } from "@nexus/identity-and-access/api/_lib/events";
import { shouldForward, forwardToRuntime } from "./runtime-events";

/** Resolve the public base URL for links in emails. */
function baseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "";
}

function fromAddress(): string {
  const explicit = process.env.EMAIL_FROM;
  if (explicit) return explicit;
  const slug = process.env.COMPANY_SLUG || "no-reply";
  return `${slug}@nexusaiholdings.com`;
}

async function sendPasswordResetEmail(payload: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const email = String(payload.email || "");
  const token = String(payload.token || "");
  if (!email || !token) return;
  if (!apiKey) {
    console.warn("[event] RESEND_API_KEY not set — password reset email not sent");
    return;
  }
  const base = baseUrl();
  if (!base) {
    console.warn("[event] APP_BASE_URL / VERCEL_PROJECT_PRODUCTION_URL not set — reset email not sent");
    return;
  }

  const companyName = process.env.COMPANY_NAME || "Your account";
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">` +
    `<p>We received a request to reset your ${companyName} password.</p>` +
    `<p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Reset your password</a></p>` +
    `<p style="color:#555">Or paste this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>` +
    `<p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>` +
    `</div>`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${companyName} <${fromAddress()}>`,
      to: [email],
      subject: `Reset your ${companyName} password`,
      html,
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error(`[event] Resend send failed (${resp.status}): ${detail.slice(0, 300)}`);
  } else {
    console.log(`[event] sent password-reset email to ${email}`);
  }
}

/**
 * Build the substrate's EventBus. Logs every event; delivers transactional
 * emails for the events that need them. All sending is best-effort.
 */
export function buildEventBus(): EventBus {
  return {
    async publish(
      subject: string,
      payload: Record<string, unknown>,
    ): Promise<void> {
      // eslint-disable-next-line no-console
      console.log(`[event] ${subject}`, JSON.stringify(payload).slice(0, 200));
      try {
        if (subject === "user.password_reset_requested") {
          await sendPasswordResetEmail(payload);
        }
      } catch (err) {
        // Fire-and-forget: never let email delivery break the handler.
        console.error(`[event] delivery error for ${subject}: ${err}`);
      }
      // measurement-produce-side-001: forward keystone events to the
      // portfolio-runtime so they reach the measurement engine. Awaited so
      // the serverless function doesn't terminate before delivery, but
      // forwardToRuntime never throws (fire-and-forget contract).
      try {
        if (shouldForward(subject)) {
          await forwardToRuntime(subject, payload);
        }
      } catch (err) {
        console.error(`[event] forward error for ${subject}: ${err}`);
      }
    },
  };
}
