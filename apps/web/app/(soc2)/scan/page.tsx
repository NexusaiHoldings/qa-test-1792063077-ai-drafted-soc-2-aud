import Link from "next/link";
import { redirect } from "next/navigation";
import { upsertConnection } from "@/lib/soc2/access";
import { resolveOrgContext } from "@/lib/soc2/access";
import {
  getScanProgress,
  upsertScanSession,
  ensureConnectionRun,
  trackScanEvent,
} from "@/lib/soc2/scan";

export default async function ScanPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const progress = await getScanProgress(ctx);

  async function startScan(formData: FormData): Promise<void> {
    "use server";
    const localCtx = await resolveOrgContext();
    if (!localCtx) redirect("/login");

    const quoteRaw = String(formData.get("consultant_quote_usd") ?? "").trim();
    const auditorChosenRaw = String(formData.get("auditor_chosen") ?? "").trim();

    const quoteNum = quoteRaw ? Number(quoteRaw) : null;
    const consultantQuoteUsd = quoteNum !== null && Number.isFinite(quoteNum) ? quoteNum : null;
    const auditorChosen = auditorChosenRaw === "yes" ? true : auditorChosenRaw === "no" ? false : null;

    await upsertScanSession(localCtx, {
      consultantQuoteUsd,
      auditorChosen,
    });

    redirect("/scan");
  }

  async function connectAws(): Promise<void> {
    "use server";
    const localCtx = await resolveOrgContext();
    if (!localCtx) redirect("/login");

    await upsertConnection({
      organizationId: localCtx.orgId,
      provider: "aws",
      status: "healthy",
      scopeDescription: "Read-only AWS posture scan",
      displayName: "AWS Account",
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      createdBy: localCtx.user.id,
      config: { role: "ReadOnly", external_id: "soc2-scan" },
    });

    await ensureConnectionRun(localCtx.orgId, "aws");
    await trackScanEvent("aws_connected", localCtx.user.id, localCtx.orgId);

    redirect("/scan");
  }

  async function connectGithub(): Promise<void> {
    "use server";
    const localCtx = await resolveOrgContext();
    if (!localCtx) redirect("/login");

    await upsertConnection({
      organizationId: localCtx.orgId,
      provider: "github",
      status: "healthy",
      scopeDescription: "Read-only GitHub org settings scan",
      displayName: "GitHub Organization",
      connectedAt: new Date(),
      lastSyncAt: new Date(),
      createdBy: localCtx.user.id,
      config: { app: "soc2-readonly" },
    });

    await ensureConnectionRun(localCtx.orgId, "github");
    await trackScanEvent("github_connected", localCtx.user.id, localCtx.orgId);

    redirect("/scan/status");
  }

  const dueDate = new Date(progress.commitmentDueAt).toLocaleString();

  return (
    <main>
      <h1>Free SOC 2 gap scan</h1>
      <p>Connect AWS and GitHub in minutes. Your first gap report arrives within 24 hours.</p>

      <section className="card">
        <h2>Step 1 — Connect AWS</h2>
        <p className="muted">We only read configuration metadata required for SOC 2 controls.</p>
        {progress.awsStatus === "healthy" ? (
          <p>AWS connected ✅</p>
        ) : (
          <form action={connectAws}>
            <button type="submit">Connect AWS</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Step 2 — Connect GitHub</h2>
        <p className="muted">We review branch protection, required reviews, org security settings, and alerts.</p>
        {progress.githubStatus === "healthy" ? (
          <p>GitHub connected ✅</p>
        ) : (
          <form action={connectGithub}>
            <button type="submit" disabled={progress.awsStatus !== "healthy"}>
              Connect GitHub
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Step 3 — We&apos;re preparing your first report</h2>
        <p>Commitment: report ready by <strong>{dueDate}</strong>.</p>
        <p className="muted">
          Optional buyer context (for us to improve onboarding and pricing conversations):
        </p>
        <form action={startScan}>
          <label htmlFor="consultant_quote_usd">Consultant quote you received (USD)</label>
          <input id="consultant_quote_usd" name="consultant_quote_usd" type="number" min={0} step="1" />
          <label htmlFor="auditor_chosen">Auditor already chosen?</label>
          <select id="auditor_chosen" name="auditor_chosen" defaultValue="">
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <button type="submit">Save and continue</button>
        </form>
      </section>

      <p>
        <Link className="btn secondary" href="/scan/status">
          View scan progress
        </Link>
      </p>
    </main>
  );
}
