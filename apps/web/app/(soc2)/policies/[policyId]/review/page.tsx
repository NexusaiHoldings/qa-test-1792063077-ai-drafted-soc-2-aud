/**
 * Policy Review & Sign-off Gate — the human-in-loop checkpoint (F1-008).
 *
 * Server component. Renders the version diff against the last approved version,
 * a reviewer-assignment picker, a per-clause comment thread shape (composed from
 * @nexus/social-and-engagement), and a sticky footer with an accent
 * "Approve version" button and a secondary "Request changes". All enforcement
 * (owner/admin role, no self-approval, per-version disclaimer acknowledgment,
 * exact version-hash match) lives server-side in @/lib/soc2/approvals.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignReviewer,
  decidePolicyVersion,
  describeApprovalError,
  getPolicyReviewPageData,
  type PolicyReviewPageData,
} from "@/lib/soc2/approvals";

type ReviewPageProps = {
  params: { policyId: string };
  searchParams?: { error?: string; done?: string };
};

function reviewPath(policyId: string): string {
  return `/policies/${policyId}/review`;
}

async function assignAction(formData: FormData): Promise<void> {
  "use server";
  const policyId = String(formData.get("policyId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const reviewerUserId = String(formData.get("reviewerUserId") ?? "");
  const note = String(formData.get("note") ?? "");
  if (!reviewerUserId) {
    redirect(`${reviewPath(policyId)}?error=${encodeURIComponent("Pick a reviewer to assign.")}`);
  }
  const result = await assignReviewer({ policyId, versionId, reviewerUserId, note });
  revalidatePath(reviewPath(policyId));
  redirect(
    `${reviewPath(policyId)}?${result.ok ? "done" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

async function approveAction(formData: FormData): Promise<void> {
  "use server";
  const policyId = String(formData.get("policyId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const versionHash = String(formData.get("versionHash") ?? "");
  const acknowledgeDisclaimer = formData.get("acknowledgeDisclaimer") === "on";
  const reviewComment = String(formData.get("reviewComment") ?? "");
  const result = await decidePolicyVersion({
    policyId,
    versionId,
    versionHash,
    decision: "approve",
    acknowledgeDisclaimer,
    reviewComment,
  });
  revalidatePath(reviewPath(policyId));
  redirect(
    `${reviewPath(policyId)}?${result.ok ? "done" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

async function requestChangesAction(formData: FormData): Promise<void> {
  "use server";
  const policyId = String(formData.get("policyId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const versionHash = String(formData.get("versionHash") ?? "");
  const requestChangesReason = String(formData.get("requestChangesReason") ?? "");
  const result = await decidePolicyVersion({
    policyId,
    versionId,
    versionHash,
    decision: "request_changes",
    requestChangesReason,
  });
  revalidatePath(reviewPath(policyId));
  redirect(
    `${reviewPath(policyId)}?${result.ok ? "done" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

function DiffBlock({ lines }: { lines: PolicyReviewPageData["diffLines"] }): JSX.Element {
  if (lines.length === 0) {
    return <p className="muted">No content to diff.</p>;
  }
  return (
    <pre aria-label="Version diff" style={{ overflowX: "auto" }}>
      {lines.map((line, idx) => {
        const prefix = line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ";
        const weight = line.kind === "same" ? "normal" : "bold";
        return (
          <div key={idx} style={{ fontWeight: weight, opacity: line.kind === "same" ? 0.7 : 1 }}>
            {prefix}
            {line.text}
          </div>
        );
      })}
    </pre>
  );
}

export default async function PolicyReviewPage({
  params,
  searchParams,
}: ReviewPageProps): Promise<JSX.Element> {
  let data: PolicyReviewPageData;
  try {
    data = await getPolicyReviewPageData(params.policyId);
  } catch (err) {
    return (
      <main>
        <h1>Policy review &amp; sign-off</h1>
        <section className="empty">
          <h2>Unavailable</h2>
          <p>{describeApprovalError(err)}</p>
        </section>
      </main>
    );
  }

  const errorMsg = searchParams?.error ?? null;
  const doneMsg = searchParams?.done ?? null;

  return (
    <main>
      <h1>Policy review &amp; sign-off</h1>
      <p>
        The final human checkpoint before auditor handoff. Approvers must be an organization owner or admin,
        cannot approve a draft they authored, and must acknowledge the AI-content disclaimer for this exact
        version hash.
      </p>

      {errorMsg ? (
        <p className="card" role="alert">
          <strong>Action blocked:</strong> {errorMsg}
        </p>
      ) : null}
      {doneMsg ? (
        <p className="card" role="status">
          {doneMsg}
        </p>
      ) : null}

      {data.pendingBanner.show ? (
        <p className="card">
          <strong>Pending approval.</strong> {data.pendingBanner.message}
        </p>
      ) : null}

      {data.approvedStamp.show ? (
        <section className="card">
          <h2>✓ Approved</h2>
          <p>
            Signed off by <strong>{data.approvedStamp.approverName ?? "Unknown reviewer"}</strong> on{" "}
            <strong>{data.approvedStamp.approvedAt ?? "unknown date"}</strong>.
          </p>
          <p className="muted">
            Version hash: <code>{data.approvedStamp.versionHash}</code> — this stamp travels with the auditor
            handoff package.
          </p>
        </section>
      ) : null}

      {!data.reviewVersion ? (
        <section className="empty">
          <h2>Nothing to review</h2>
          <p>No draft version is currently assigned to this policy. Generate a draft in the policy studio first.</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{data.policy.title}</h2>
            <p className="muted">
              Status: <strong>{data.policy.status}</strong> · Version {data.reviewVersion.versionNumber} · Hash:{" "}
              <code>{data.reviewVersion.versionHash}</code>
            </p>
            {data.reviewVersion.changeSummary ? (
              <p>
                <strong>Change summary:</strong> {data.reviewVersion.changeSummary}
              </p>
            ) : null}
          </section>

          <section className="card">
            <h3>Version diff against last approved</h3>
            {data.previousApprovedVersion ? (
              <p className="muted">
                Comparing version {data.reviewVersion.versionNumber} against the last approved version{" "}
                {data.previousApprovedVersion.versionNumber} (hash{" "}
                <code>{data.previousApprovedVersion.versionHash}</code>).
              </p>
            ) : (
              <p className="muted">No previously approved version — this is the first approval cycle.</p>
            )}
            <DiffBlock lines={data.diffLines} />
          </section>

          <section className="card">
            <h3>Reviewer assignment</h3>
            {data.currentAssignee ? (
              <p>
                Currently assigned to <strong>{data.currentAssignee.reviewerEmail ?? data.currentAssignee.reviewerUserId}</strong>{" "}
                <span className="muted">(assigned {data.currentAssignee.assignedAt})</span>
              </p>
            ) : (
              <p className="muted">No reviewer assigned yet.</p>
            )}
            <form action={assignAction}>
              <input type="hidden" name="policyId" value={data.policy.id} />
              <input type="hidden" name="versionId" value={data.reviewVersion.id} />
              <div className="toolbar">
                <label htmlFor="reviewerUserId">
                  Assign reviewer (owner/admin)
                  <select id="reviewerUserId" name="reviewerUserId" defaultValue="">
                    <option value="">Select a reviewer…</option>
                    {data.eligibleReviewers.map((r) => (
                      <option key={r.userId} value={r.userId}>
                        {r.email} ({r.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="note">
                  Note
                  <input id="note" name="note" type="text" placeholder="Optional context for the reviewer" />
                </label>
                <button type="submit">Assign</button>
              </div>
            </form>
          </section>

          <section className="card">
            <h3>Clause comments</h3>
            <p className="muted">
              Per-clause review threads, proposed as @nexus/social-and-engagement threads anchored to this exact
              version. Thread shape only — wiring the live thread UI is a follow-up.
            </p>
            {data.clauseThreads.length === 0 ? (
              <p className="muted">No clauses detected in this version.</p>
            ) : (
              <ul>
                {data.clauseThreads.map((clause) => (
                  <li key={clause.clauseId}>
                    <p>
                      <strong>{clause.title}</strong> <span className="muted">({clause.proposedThreadShape.threadKey})</span>
                    </p>
                    <p className="muted">{clause.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.viewerIsDrafter ? (
            <section className="card">
              <p className="muted">
                You generated this draft, so a different owner/admin must sign it off. Use the picker above to
                assign a reviewer.
              </p>
            </section>
          ) : null}

          {/* Sticky sign-off footer */}
          <section
            className="card"
            style={{
              position: "sticky",
              bottom: 0,
              zIndex: 10,
            }}
          >
            <h3>Decision</h3>
            {!data.viewerCanApprove ? (
              <p className="muted">
                Only an organization owner or admin who did not author this draft can approve or request changes.
              </p>
            ) : (
              <div className="toolbar">
                <form action={approveAction}>
                  <input type="hidden" name="policyId" value={data.policy.id} />
                  <input type="hidden" name="versionId" value={data.reviewVersion.id} />
                  <input type="hidden" name="versionHash" value={data.reviewVersion.versionHash} />
                  <label htmlFor="acknowledgeDisclaimer">
                    <input id="acknowledgeDisclaimer" name="acknowledgeDisclaimer" type="checkbox" required /> I
                    acknowledge this policy was AI-drafted and I have reviewed version hash{" "}
                    <code>{data.reviewVersion.versionHash}</code> before sign-off.
                  </label>
                  <label htmlFor="reviewComment">
                    Approval note
                    <input id="reviewComment" name="reviewComment" type="text" placeholder="Optional sign-off note" />
                  </label>
                  <button type="submit">Approve version</button>
                </form>

                <form action={requestChangesAction}>
                  <input type="hidden" name="policyId" value={data.policy.id} />
                  <input type="hidden" name="versionId" value={data.reviewVersion.id} />
                  <input type="hidden" name="versionHash" value={data.reviewVersion.versionHash} />
                  <label htmlFor="requestChangesReason">
                    Request changes reason
                    <input
                      id="requestChangesReason"
                      name="requestChangesReason"
                      type="text"
                      placeholder="Describe what needs revision"
                      required
                    />
                  </label>
                  <button type="submit" className="btn secondary">
                    Request changes
                  </button>
                </form>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
