import { redirect } from "next/navigation";
import { getSoc2PlanTier, resolveOrgContext } from "@/lib/soc2/access";
import { emitScanEvent, getLatestScanStatus } from "@/lib/soc2/scan";

function timeUntil(iso: string): string {
  const due = Date.parse(iso);
  if (Number.isNaN(due)) return "within 24 hours";
  const ms = due - Date.now();
  if (ms <= 0) return "any moment now";
  const hours = Math.ceil(ms / 3600000);
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export default async function ScanStatusPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const status = await getLatestScanStatus(ctx.orgId);
  if (!status) redirect("/scan");

  const tier = await getSoc2PlanTier(ctx.orgId);
  if (status.session.status === "report_ready") {
    await emitScanEvent("report_ready", {
      organization_id: ctx.orgId,
      findings_total: status.findingsTotal,
      findings_visible: status.findingsVisible,
      plan_tier: tier,
    });
  }

  const quote = status.session.consultant_quote_amount;
  const delta =
    quote && status.findingsTotal > 0 ? Math.max(0, Math.round(quote - status.findingsTotal * 450)) : null;

  return (
    <main>
      {status.session.status === "report_ready" ? (
        <>
          <h1>🎉 Your first gap report is ready</h1>
          <p>
            We found {status.findingsTotal} actionable finding{status.findingsTotal === 1 ? "" : "s"}
            {delta !== null ? ` — roughly $${delta.toLocaleString()} below your consultant quote benchmark.` : "."}
          </p>
        </>
      ) : (
        <>
          <h1>Your first gap report is being prepared</h1>
          <p>We’ll deliver initial findings {timeUntil(status.session.report_due_at)}.</p>
        </>
      )}

      <section className="card">
        <h2>Scan progress</h2>
        <p aria-live="polite">{status.progressPercent}% complete</p>
        <progress value={status.progressPercent} max={100} />
        <ul>
          <li>{status.awsConnected ? "✅" : "○"} AWS connected</li>
          <li>{status.githubConnected ? "✅" : "○"} GitHub connected</li>
          <li>{status.session.status === "report_ready" ? "✅" : "○"} Gap report generated</li>
        </ul>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>What you can access now</h2>
        <ul>
          <li>Full control coverage meter</li>
          <li>Top 5 findings preview</li>
          {tier === "free" ? (
            <>
              <li className="muted">Remaining findings (locked on free)</li>
              <li className="muted">Remediation queue (locked on free)</li>
              <li className="muted">Policy drafting studio (locked on free)</li>
            </>
          ) : (
            <>
              <li>All findings</li>
              <li>Remediation queue</li>
              <li>Policy drafting studio</li>
            </>
          )}
        </ul>
        {tier === "free" ? (
          <a className="btn" href="/billing">
            Upgrade to unlock full report
          </a>
        ) : (
          <a className="btn" href="/gaps">
            Open remediation queue
          </a>
        )}
      </section>
    </main>
  );
}
