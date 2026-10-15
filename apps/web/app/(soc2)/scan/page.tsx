import { redirect } from "next/navigation";
import { getConnection, resolveOrgContext } from "@/lib/soc2/access";
import { emitScanEvent, startOrGetActiveScanSession, updateScanSessionResearch } from "@/lib/soc2/scan";

async function handleStart(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) {
    redirect("/login");
  }

  const quoteRaw = String(formData.get("consultant_quote_amount") ?? "").trim();
  const quote = quoteRaw ? Number(quoteRaw) : null;
  const consultantQuoteAmount = Number.isFinite(quote ?? NaN) ? quote : null;
  const consultantQuoteCurrency = "USD";
  const auditorRaw = String(formData.get("auditor_selected") ?? "").trim();
  const auditorSelected = auditorRaw === "yes" ? true : auditorRaw === "no" ? false : null;

  const session = await startOrGetActiveScanSession({
    organizationId: ctx.orgId,
    userId: ctx.user.id,
    consultantQuoteAmount,
    consultantQuoteCurrency,
    auditorSelected,
  });

  await updateScanSessionResearch({
    sessionId: session.id,
    consultantQuoteAmount,
    consultantQuoteCurrency,
    auditorSelected,
  });

  await emitScanEvent("scan_started", {
    organization_id: ctx.orgId,
    user_id: ctx.user.id,
    consultant_quote_amount: consultantQuoteAmount,
    auditor_selected: auditorSelected,
  });

  redirect("/scan/status");
}

export default async function ScanPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const aws = await getConnection(ctx.orgId, "aws");
  const github = await getConnection(ctx.orgId, "github");

  const awsConnected = aws?.status === "healthy";
  const githubConnected = github?.status === "healthy";

  return (
    <main>
      <h1>Free SOC 2 gap scan</h1>
      <p>Connect AWS and GitHub to get your first gap report within 24 hours.</p>

      <section className="card">
        <h2>Step 1 — Connect AWS</h2>
        <p className="muted">Read-only scan of IAM, CloudTrail, GuardDuty, Config, and baseline settings.</p>
        <p>{awsConnected ? "✅ AWS connected" : "Not connected yet"}</p>
        <a className="btn" href="/connections/aws">
          {awsConnected ? "Review AWS connection" : "Connect AWS"}
        </a>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Step 2 — Connect GitHub</h2>
        <p className="muted">Read-only scan of branch protection, org security settings, and dependency alerts.</p>
        <p>{githubConnected ? "✅ GitHub connected" : "Not connected yet"}</p>
        <a className="btn" href="/connections/github">
          {githubConnected ? "Review GitHub connection" : "Connect GitHub"}
        </a>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Step 3 — Start your report</h2>
        <p className="muted">Optional fields help us learn pricing and buyer motion for future onboarding improvements.</p>
        <form action={handleStart}>
          <label htmlFor="consultant_quote_amount">Consultant quote you received (optional, USD)</label>
          <input id="consultant_quote_amount" name="consultant_quote_amount" type="number" min="0" step="100" />
          <label htmlFor="auditor_selected" style={{ marginTop: 12, display: "block" }}>
            Have you already chosen an auditor? (optional)
          </label>
          <select id="auditor_selected" name="auditor_selected" defaultValue="">
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <div style={{ marginTop: 16 }}>
            <button type="submit">Start free scan</button>
          </div>
        </form>
      </section>
    </main>
  );
}
