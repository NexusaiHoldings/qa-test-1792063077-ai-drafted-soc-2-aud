import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOrgContext } from "@/lib/soc2/access";
import { getScanProgress } from "@/lib/soc2/scan";

export default async function ScanStatusPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const progress = await getScanProgress(ctx);

  return (
    <main>
      <h1>Scan status</h1>
      <p>Your first gap report is being prepared. We&apos;ll keep this page live as data arrives.</p>

      <section className="card">
        <h2>Progress</h2>
        <p style={{ fontSize: "2rem", margin: "0.5rem 0" }}>{progress.percent}%</p>
        <p className="muted">
          Runs completed: {progress.completedRuns}/{Math.max(progress.totalRuns, 2)}{" "}
          {progress.failedRuns > 0 ? `(failed: ${progress.failedRuns})` : ""}
        </p>
        <p>Commitment deadline: {new Date(progress.commitmentDueAt).toLocaleString()}</p>
      </section>

      <section className="card">
        <h2>Connections</h2>
        <ul>
          <li>AWS: {progress.awsStatus}</li>
          <li>GitHub: {progress.githubStatus}</li>
        </ul>
      </section>

      {progress.reportReady ? (
        <section className="card">
          <h2>🎉 Your report is ready</h2>
          <p>
            We found <strong>{progress.findingsCount}</strong> findings.
            {progress.estimatedConsultantDeltaUsd !== null
              ? ` That is an estimated $${progress.estimatedConsultantDeltaUsd.toLocaleString()} below your consultant quote.`
              : ""}
          </p>
          <p>
            Free plan preview: top <strong>{progress.topFindingsCount}</strong> findings shown.
            {progress.hiddenFindingsCount > 0 ? ` Upgrade to unlock ${progress.hiddenFindingsCount} more findings.` : ""}
          </p>
          <p>
            <Link className="btn" href="/billing">
              Upgrade to unlock remediation & policy drafting
            </Link>
          </p>
        </section>
      ) : (
        <div className="empty">
          <p>Still collecting evidence. This usually completes quickly after both connections are healthy.</p>
        </div>
      )}

      <p>
        <Link className="btn secondary" href="/scan">
          Back to scan setup
        </Link>
      </p>
    </main>
  );
}
