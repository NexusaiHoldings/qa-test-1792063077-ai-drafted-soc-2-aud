/**
 * /connections/[provider] — connect / manage a single provider (F1-002).
 *
 * Provider-specific connect flow + status for AWS, GCP, GitHub, HRIS. All
 * mutations run as server actions (no client-side secrets): AWS generates a
 * per-tenant ExternalId and a CloudFormation launch link; GitHub generates an
 * App install link; GCP accepts a service-account JSON upload; HRIS accepts a
 * BambooHR/Rippling API key or a CSV roster. Failing connections show the
 * structured failure code + inline fix hint. Everything is org-scoped and
 * audit-logged via apps/web/lib/soc2/access.ts.
 */
import type { JSX } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearConnection,
  formatRelativeTime,
  getConnection,
  logConnectionEvent,
  resolveOrgContext,
  SOC2_PROVIDERS,
  type ConnectionStatus,
  type ProviderDescriptor,
  type Soc2Provider,
} from "@/lib/soc2/access";
import {
  AWS_DESCRIPTOR,
  beginAwsConnection,
  buildLaunchUrl,
  completeAwsConnection,
  verifyAws,
} from "@/lib/soc2/connectors/aws";
import {
  GCP_DESCRIPTOR,
  connectGcpServiceAccount,
  disconnectGcp,
  verifyGcp,
} from "@/lib/soc2/connectors/gcp";
import {
  GITHUB_DESCRIPTOR,
  beginGithubConnection,
  buildInstallUrl,
  verifyGithub,
} from "@/lib/soc2/connectors/github";
import {
  HRIS_DESCRIPTOR,
  connectHrisApiKey,
  connectHrisCsv,
  disconnectHris,
  verifyHris,
  type HrisVendor,
} from "@/lib/soc2/connectors/hris";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DESCRIPTORS: Record<Soc2Provider, ProviderDescriptor> = {
  aws: AWS_DESCRIPTOR,
  gcp: GCP_DESCRIPTOR,
  github: GITHUB_DESCRIPTOR,
  hris: HRIS_DESCRIPTOR,
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "Not connected",
  connecting: "Connecting",
  healthy: "Healthy",
  failing: "Failing",
};

function isProvider(value: string): value is Soc2Provider {
  return (SOC2_PROVIDERS as readonly string[]).includes(value);
}

// ── Server actions ─────────────────────────────────────────────────────────

async function beginAwsAction(): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  await beginAwsConnection(ctx);
  revalidatePath("/connections/aws");
  revalidatePath("/connections");
}

async function completeAwsAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const roleArn = String(formData.get("role_arn") ?? "");
  await completeAwsConnection(ctx, roleArn);
  revalidatePath("/connections/aws");
  revalidatePath("/connections");
}

async function beginGithubAction(): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  await beginGithubConnection(ctx);
  revalidatePath("/connections/github");
  revalidatePath("/connections");
}

async function connectGcpAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const json = String(formData.get("sa_json") ?? "");
  await connectGcpServiceAccount(ctx, json);
  revalidatePath("/connections/gcp");
  revalidatePath("/connections");
}

async function connectHrisKeyAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const vendor = String(formData.get("vendor") ?? "bamboohr") as HrisVendor;
  const apiKey = String(formData.get("api_key") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  await connectHrisApiKey(ctx, { vendor, apiKey, subdomain: subdomain || null });
  revalidatePath("/connections/hris");
  revalidatePath("/connections");
}

async function connectHrisCsvAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const file = formData.get("roster") as File | null;
  const fileName = file && typeof file.name === "string" && file.name ? file.name : "roster.csv";
  const sizeBytes = file && typeof file.size === "number" ? file.size : 0;
  await connectHrisCsv(ctx, { fileName, contentType: "text/csv", sizeBytes });
  revalidatePath("/connections/hris");
  revalidatePath("/connections");
}

async function verifyAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const provider = String(formData.get("provider") ?? "");
  if (!isProvider(provider)) return;
  const conn = await getConnection(ctx.orgId, provider);
  if (!conn) return;
  if (provider === "aws") await verifyAws(ctx, conn);
  else if (provider === "gcp") await verifyGcp(ctx, conn);
  else if (provider === "github") await verifyGithub(ctx, conn);
  else if (provider === "hris") await verifyHris(ctx, conn);
  revalidatePath(`/connections/${provider}`);
  revalidatePath("/connections");
}

async function disconnectAction(formData: FormData): Promise<void> {
  "use server";
  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");
  const provider = String(formData.get("provider") ?? "");
  if (!isProvider(provider)) return;
  const conn = await getConnection(ctx.orgId, provider);
  if (conn) {
    if (provider === "gcp") await disconnectGcp(ctx, conn);
    else if (provider === "hris") await disconnectHris(ctx, conn);
    else
      await logConnectionEvent({
        organizationId: ctx.orgId,
        provider,
        connectionId: conn.id,
        eventType: "disconnected",
        actorUserId: ctx.user.id,
      });
  }
  await clearConnection(ctx.orgId, provider);
  revalidatePath(`/connections/${provider}`);
  revalidatePath("/connections");
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ProviderPage({
  params,
}: {
  params: { provider: string };
}): Promise<JSX.Element> {
  if (!isProvider(params.provider)) notFound();
  const provider = params.provider;
  const descriptor = DESCRIPTORS[provider];

  const ctx = await resolveOrgContext();
  if (!ctx) redirect("/login");

  const conn = await getConnection(ctx.orgId, provider);
  const status: ConnectionStatus = conn?.status ?? "not_connected";

  return (
    <main>
      <p>
        <Link href="/connections">← All connections</Link>
      </p>
      <h1>{descriptor.label}</h1>
      <p>{descriptor.blurb}</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ margin: 0 }}>
          <strong>Status:</strong> {STATUS_LABEL[status]}
        </p>
        <p style={{ margin: "6px 0 0" }}>
          <strong>Last sync:</strong> {formatRelativeTime(conn?.last_sync_at ?? null)}
        </p>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
          <strong>Read-only scope:</strong> {descriptor.scopeDescription}
        </p>
        {status === "failing" && conn?.failure_code ? (
          <div
            role="alert"
            style={{
              marginTop: 12,
              border: "1px solid #ffc9c9",
              background: "#fff5f5",
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#c92a2a" }}>
              Failure: <code>{conn.failure_code}</code>
            </div>
            {conn.failure_hint ? <div style={{ marginTop: 4 }}>{conn.failure_hint}</div> : null}
          </div>
        ) : null}
      </div>

      {provider === "aws" ? <AwsSection conn={conn} /> : null}
      {provider === "github" ? <GithubSection ctx_org={ctx.orgId} conn={conn} /> : null}
      {provider === "gcp" ? <GcpSection /> : null}
      {provider === "hris" ? <HrisSection /> : null}

      {status !== "not_connected" ? (
        <section style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <form action={verifyAction}>
            <input type="hidden" name="provider" value={provider} />
            <button type="submit">Run health check</button>
          </form>
          <form action={disconnectAction}>
            <input type="hidden" name="provider" value={provider} />
            <button type="submit" className="secondary">Disconnect</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

// ── Provider sections ────────────────────────────────────────────────────────

function AwsSection({ conn }: { conn: Awaited<ReturnType<typeof getConnection>> }): JSX.Element {
  const externalId = conn?.external_id ?? null;
  return (
    <section>
      <h2>Connect AWS</h2>
      <ol>
        <li>Generate your secure launch link (we create a per-tenant ExternalId).</li>
        <li>Launch the CloudFormation stack in your AWS account and click <em>Create stack</em>.</li>
        <li>Copy the <code>RoleArn</code> from the stack&apos;s Outputs and paste it below.</li>
      </ol>

      {!externalId ? (
        <form action={beginAwsAction}>
          <button type="submit" style={{ background: "var(--accent, #4c6ef5)", color: "#fff", borderColor: "transparent" }}>
            Generate secure launch link
          </button>
        </form>
      ) : (
        <>
          <p>
            <a
              className="btn"
              href={buildLaunchUrl(externalId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "var(--accent, #4c6ef5)", color: "#fff", borderColor: "transparent" }}
            >
              Launch CloudFormation
            </a>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Your ExternalId: <code>{externalId}</code> — the stack trust policy pins this so the role can only be assumed by Nexus.
          </p>
          <form action={completeAwsAction} style={{ marginTop: 12 }}>
            <label htmlFor="role_arn">Role ARN (from stack Outputs)</label>
            <input id="role_arn" name="role_arn" placeholder="arn:aws:iam::123456789012:role/nexus-soc2-readonly" />
            <button type="submit">Save role &amp; connect</button>
          </form>
        </>
      )}
    </section>
  );
}

function GithubSection({
  ctx_org,
  conn,
}: {
  ctx_org: string;
  conn: Awaited<ReturnType<typeof getConnection>>;
}): JSX.Element {
  const installUrl = buildInstallUrl({ orgId: ctx_org, orgName: "", user: { id: "", email: "" } });
  return (
    <section>
      <h2>Connect GitHub</h2>
      <p>
        Install the read-only Nexus GitHub App on your organization. It requests
        Administration, Metadata, Members and Dependabot alerts (read) — and no
        Contents permission, so we never see your source code.
      </p>
      {conn && conn.status !== "not_connected" ? (
        <p>
          <a className="btn secondary" href={installUrl} target="_blank" rel="noopener noreferrer">
            Re-open GitHub App install
          </a>
        </p>
      ) : (
        <form action={beginGithubAction}>
          <button type="submit">Install GitHub App</button>
        </form>
      )}
      {conn?.status === "connecting" ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Waiting for the installation webhook from GitHub — this card flips to
          Healthy automatically once the App is installed.
        </p>
      ) : null}
    </section>
  );
}

function GcpSection(): JSX.Element {
  return (
    <section>
      <h2>Connect GCP</h2>
      <ol>
        <li>Create a service account and grant it <code>roles/viewer</code> + <code>roles/iam.securityReviewer</code>.</li>
        <li>Create a JSON key for that service account and download it.</li>
        <li>Paste the full JSON key below — we envelope-encrypt it; it never leaves the vault in plaintext.</li>
      </ol>
      <form action={connectGcpAction}>
        <label htmlFor="sa_json">Service-account JSON key</label>
        <textarea
          id="sa_json"
          name="sa_json"
          rows={8}
          placeholder='{ "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
          style={{ width: "100%", fontFamily: "monospace", fontSize: 13 }}
        />
        <button type="submit">Upload &amp; connect</button>
      </form>
    </section>
  );
}

function HrisSection(): JSX.Element {
  return (
    <section>
      <h2>Connect HRIS</h2>
      <p>Connect BambooHR or Rippling with a read-only API key, or upload a CSV roster if your HRIS has no usable API.</p>

      <h3>Option A — API key</h3>
      <form action={connectHrisKeyAction}>
        <label htmlFor="vendor">Vendor</label>
        <select id="vendor" name="vendor" defaultValue="bamboohr">
          <option value="bamboohr">BambooHR</option>
          <option value="rippling">Rippling</option>
        </select>
        <label htmlFor="subdomain">BambooHR subdomain (BambooHR only)</label>
        <input id="subdomain" name="subdomain" placeholder="acme (from acme.bamboohr.com)" />
        <label htmlFor="api_key">API key / token</label>
        <input id="api_key" name="api_key" type="password" placeholder="paste read-only API key" />
        <button type="submit">Connect HRIS</button>
      </form>

      <h3 style={{ marginTop: 20 }}>Option B — CSV roster fallback</h3>
      <form action={connectHrisCsvAction} encType="multipart/form-data">
        <label htmlFor="roster">Employee roster (CSV)</label>
        <input id="roster" name="roster" type="file" accept=".csv,text/csv" />
        <button type="submit" className="secondary">Upload roster</button>
      </form>
    </section>
  );
}
