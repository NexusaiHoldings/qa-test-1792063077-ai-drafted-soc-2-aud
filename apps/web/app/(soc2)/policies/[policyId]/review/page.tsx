import { decidePolicyVersion, getPolicyReviewPageData } from "@/lib/soc2/approvals";

type ReviewPageProps = {
  params: { policyId: string };
};

async function approveAction(formData: FormData): Promise<void> {
  "use server";
  const policyId = String(formData.get("policyId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const comment = String(formData.get("comment") ?? "");
  await decidePolicyVersion({
    policyId,
    versionId,
    decision: "approve",
    reviewComment: comment,
  });
}

async function requestChangesAction(formData: FormData): Promise<void> {
  "use server";
  const policyId = String(formData.get("policyId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const reason = String(formData.get("requestChangesReason") ?? "");
  await decidePolicyVersion({
    policyId,
    versionId,
    decision: "request_changes",
    requestChangesReason: reason,
  });
}

export default async function PolicyReviewPage({ params }: ReviewPageProps) {
  const data = await getPolicyReviewPageData(params.policyId);

  return (
    <main>
      <h1>Policy review &amp; sign-off</h1>
      <p>
        Final human approval gate before auditor handoff. Approvers must be owner/admin, cannot approve their own
        generated draft, and must review AI disclaimer acknowledgment for this exact version hash.
      </p>

      {data.pendingBanner.show ? <p className="card">{data.pendingBanner.message}</p> : null}

      {data.approvedStamp.show ? (
        <section className="card">
          <h2>Approved stamp</h2>
          <p>
            Approved by <strong>{data.approvedStamp.approverName ?? "Unknown reviewer"}</strong> on{" "}
            <strong>{data.approvedStamp.approvedAt ?? "Unknown date"}</strong>
          </p>
          <p className="muted">Version hash: {data.approvedStamp.versionHash}</p>
        </section>
      ) : null}

      {!data.reviewVersion ? (
        <section className="empty">
          <h2>Nothing to review</h2>
          <p>No draft version is currently assigned to this policy.</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{data.policy.title}</h2>
            <p className="muted">
              Policy status: <strong>{data.policy.status}</strong> · Version hash:{" "}
              <code>{data.reviewVersion.versionHash}</code>
            </p>
            <h3>Version diff against last approved</h3>
            {data.previousApprovedVersion ? (
              <table>
                <thead>
                  <tr>
                    <th>Previous approved</th>
                    <th>Current review version</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <p>
                        Hash: <code>{data.previousApprovedVersion.versionHash}</code>
                      </p>
                      <pre>{data.previousApprovedVersion.bodyMarkdown.slice(0, 1200)}</pre>
                    </td>
                    <td>
                      <p>
                        Hash: <code>{data.reviewVersion.versionHash}</code>
                      </p>
                      <pre>{data.reviewVersion.bodyMarkdown.slice(0, 1200)}</pre>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="muted">No previously approved version found. This appears to be the first approval cycle.</p>
            )}
          </section>

          <section className="card">
            <h3>Reviewer assignment</h3>
            <p className="muted">
              Reviewer assignment picker is represented here as a proposal shape pending integration with
              @nexus/organizations-and-teams directory APIs.
            </p>
            <label htmlFor="reviewer">
              Assign reviewer
              <select id="reviewer" name="reviewer" defaultValue="">
                <option value="">Select owner/admin reviewer</option>
                <option value="owner_or_admin_placeholder">Owner/Admin (placeholder)</option>
              </select>
            </label>
          </section>

          <section className="card">
            <h3>Clause comments (proposed thread shape)</h3>
            {data.clauseThreads.length === 0 ? (
              <p className="muted">No clauses detected.</p>
            ) : (
              <ul>
                {data.clauseThreads.map((clause) => (
                  <li key={clause.clauseId}>
                    <p>
                      <strong>{clause.title}</strong>
                    </p>
                    <p className="muted">{clause.excerpt}</p>
                    <pre>{JSON.stringify(clause.proposedThreadShape, null, 2)}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3>Decision</h3>
            <div className="toolbar">
              <form action={approveAction}>
                <input type="hidden" name="policyId" value={data.policy.id} />
                <input type="hidden" name="versionId" value={data.reviewVersion.id} />
                <label htmlFor="approveComment">
                  Approval comment
                  <input id="approveComment" name="comment" type="text" placeholder="Optional sign-off note" />
                </label>
                <button type="submit">Approve version</button>
              </form>

              <form action={requestChangesAction}>
                <input type="hidden" name="policyId" value={data.policy.id} />
                <input type="hidden" name="versionId" value={data.reviewVersion.id} />
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
                <button type="submit">Request changes</button>
              </form>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
