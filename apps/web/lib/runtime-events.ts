/**
 * Measurement produce-side forwarder — sprint measurement-produce-side-001.
 *
 * The legos emit domain events through buildEventBus().publish() (lib/events.ts).
 * Today those events dead-end at console.log. This module forwards the keystone
 * subset to the portfolio-runtime's POST /events ingress over the already-
 * authenticated substrate->runtime channel (RUNTIME_BASE_URL + RUNTIME_AUTH_TOKEN,
 * injected at provisioning Phase 2d). The runtime resolves company_id from the
 * bearer token, translates to measurement subjects, and republishes to NATS.
 *
 * Contract: fire-and-forget. NEVER throws — a runtime outage must not break a
 * signup or a Stripe webhook. Skips silently when env is absent (preview/local
 * builds) or when MEASUREMENT_PRODUCE_ENABLED=false (kill switch).
 */

/** The keystone forward set (contract decision C — kept minimal). */
const FORWARD_SUBJECTS: ReadonlySet<string> = new Set([
  "user.created",
  "billing.payment_succeeded",
  // feedback-to-build-loop-001: the @nexus/feedback lego forwards these so the
  // runtime can triage, drive the change-request pipeline, and reconcile. Must
  // be allow-listed here or buildEventBus() silently drops them.
  "feedback.submitted",
  "feedback.action",
  "feedback.answer",
  // email-lead-bridge-001: lead-form submissions (crm-and-lifecycle lego)
  // bridge to the control plane, which enrolls the lead in the armed
  // welcome-email sequence.
  "lead.captured",
  // operations-os-truth-to-checklist-001 Phase 2: support tickets bridge to
  // the operations OS support engine (support.ticket.created — the COO's
  // first real customer-facing loop).
  "ticket.created",
]);

/** Whether a given lego subject should be forwarded to the runtime. */
export function shouldForward(subject: string): boolean {
  return FORWARD_SUBJECTS.has(subject);
}

const FORWARD_TIMEOUT_MS = 3000;

/**
 * Forward a single event to the runtime /events ingress. Fire-and-forget:
 * resolves (never rejects) regardless of outcome. `fetchImpl` is injectable
 * for testing; defaults to global fetch.
 */
export async function forwardToRuntime(
  subject: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if ((process.env.MEASUREMENT_PRODUCE_ENABLED || "true").toLowerCase() === "false") {
    return;
  }

  const base = process.env.RUNTIME_BASE_URL;
  const token = process.env.RUNTIME_AUTH_TOKEN;
  if (!base || !token) {
    // Preview/local build without runtime wiring — log once and skip.
    console.warn(
      `[event] RUNTIME_BASE_URL/RUNTIME_AUTH_TOKEN not set — '${subject}' not forwarded`,
    );
    return;
  }

  const url = `${base.replace(/\/+$/, "")}/events`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, payload }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error(
        `[event] runtime /events forward failed (${resp.status}) for '${subject}': ${detail.slice(0, 200)}`,
      );
    } else {
      console.log(`[event] forwarded '${subject}' to runtime /events`);
    }
  } catch (err) {
    // Network error / abort / anything — swallow. Fire-and-forget contract.
    console.error(`[event] runtime /events forward error for '${subject}': ${err}`);
  } finally {
    clearTimeout(timer);
  }
}
