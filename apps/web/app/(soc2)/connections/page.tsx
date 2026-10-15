/**
 * /connections — Cloud & Code Connector Registry (F1-002).
 *
 * The page where a Series A CTO proves "read-only ingestion in minutes" is real.
 * Four large provider cards (AWS, GCP, GitHub, HRIS) in a two-column grid that
 * stacks to one column on mobile. Each card shows a status pill, the exact
 * read-only scope in plain English, and last-sync time. Failing cards surface
 * the structured failure code + an inline fix hint instead of pushing to
 * support. When nothing is connected we show an illustrated empty state with the
 * brand accent only on the AWS call-to-action.
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatRelativeTime,
  listConnections,
  resolveOrgContext,
  type ConnectionStatus,
  type ProviderDescriptor,
  type Soc2Connection,
  type Soc2Provider,
} from "@/lib/soc2/access";
import { AWS_DESCRIPTOR } from "@/lib/soc2/connectors/aws";
import { GCP_DESCRIPTOR } from "@/lib/soc2/connectors/gcp";
import { GITHUB_DESCRIPTOR } from "@/lib/soc2/connectors/github";
import { HRIS_DESCRIPTOR } from "@/lib/soc2/connectors/hris";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DESCRIPTORS: readonly ProviderDescriptor[] = [
  AWS_DESCRIPTOR,
  GITHUB_DESCRIPTOR,
  GCP_DESCRIPTOR,
  HRIS_DESCRIPTOR,
];

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "Not connected",
  connecting: "Connecting",
  healthy: "Healthy",
  failing: "Failing",
};

const STATUS_COLOR: Record<ConnectionStatus, { bg: string; fg: string; dot: string }> = {
  not_connected: { bg: "#f1f3f5", fg: "#495057", dot: "#adb5bd" },
  connecting: { bg: "#fff4e6", fg: "#9c6400", dot: "#f08c00" },
  healthy: { bg: "#ebfbee", fg: "#2b8a3e", dot: "#2f9e44" },
  failing: { bg: "#fff0f0", fg: "#c92a2a", dot: "#e03131" },
};

function StatusPill({ status }: { status: ConnectionStatus }): JSX.Element {
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function statusOf(conn: Soc2Connection | undefined): ConnectionStatus {
  return conn?.status ?? "not_connected";
}

function ProviderCard({
  descriptor,
  conn,
}: {
  descriptor: ProviderDescriptor;
  conn: Soc2Connection | undefined;
}): JSX.Element {
  const status = statusOf(conn);
  const href = `/connections/${descriptor.provider}`;
  const cta =
    status === "not_connected"
      ? "Connect"
      : status === "connecting"
        ? "Finish setup"
        : status === "failing"
          ? "Fix connection"
          : "Manage";
  const accentBtn = descriptor.accent && status === "not_connected";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{descriptor.label}</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>{descriptor.blurb}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <p style={{ margin: 0, fontSize: 14 }}>
        <strong>What we read:</strong> {descriptor.scopeDescription}
      </p>

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Last sync: {formatRelativeTime(conn?.last_sync_at ?? null)}
        {conn?.account_login ? ` · ${conn.account_login}` : ""}
      </p>

      {status === "failing" && conn?.failure_code ? (
        <div
          role="alert"
          style={{
            border: "1px solid #ffc9c9",
            background: "#fff5f5",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, color: "#c92a2a" }}>
            Failure: <code>{conn.failure_code}</code>
          </div>
          {conn.failure_hint ? <div style={{ marginTop: 4 }}>{conn.failure_hint}</div> : null}
        </div>
      ) : null}

      <div style={{ marginTop: "auto", paddingTop: 4 }}>
        <Link
          href={href}
          className={accentBtn ? "btn" : "btn secondary"}
          style={
            accentBtn
              ? { background: "var(--accent, #4c6ef5)", color: "#fff", borderColor: "transparent" }
              : undefined
          }
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}

export default async function ConnectionsPage(): Promise<JSX.Element> {
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const connections = await listConnections(ctx.orgId);
  const anyConnected = DESCRIPTORS.some((d) => {
    const s = statusOf(connections.get(d.provider));
    return s !== "not_connected";
  });

  return (
    <main>
      {/* Responsive grid: two columns on desktop, one on mobile. */}
      <style>{`
        .soc2-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
          margin-top: 24px;
        }
        @media (max-width: 720px) {
          .soc2-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <h1>Connections</h1>
      <p>
        Connect your cloud and code in minutes — all read-only. Nexus ingests
        your AWS, GCP, GitHub and HRIS configuration to map evidence against the
        SOC 2 Trust Services Criteria. No access keys are ever pasted for AWS, and
        we never read your source code.
      </p>

      {!anyConnected ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">🔌</div>
          <h2 style={{ marginTop: 12 }}>Connect AWS and GitHub to get your first gap report within 24 hours</h2>
          <p className="muted" style={{ maxWidth: 520, margin: "8px auto 16px" }}>
            Two one-click, read-only connections are enough to start. AWS uses a
            CloudFormation role (no keys), GitHub uses a read-only App (no source
            code). Add GCP and HRIS whenever you&apos;re ready.
          </p>
          <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/connections/aws"
              className="btn"
              style={{ background: "var(--accent, #4c6ef5)", color: "#fff", borderColor: "transparent" }}
            >
              Connect AWS
            </Link>
            <Link href="/connections/github" className="btn secondary">
              Connect GitHub
            </Link>
          </div>
        </div>
      ) : null}

      <div className="soc2-grid">
        {DESCRIPTORS.map((d) => (
          <ProviderCard key={d.provider} descriptor={d} conn={connections.get(d.provider as Soc2Provider)} />
        ))}
      </div>
    </main>
  );
}
