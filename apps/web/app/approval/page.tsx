/**
 * Approval Surface (spec §6.3) — chairman/user approves agent actions before execution.
 *
 * Substrate placeholder. Real implementation wires to portfolio-runtime's
 * approval queue (spec §5.8 action classes) in Phase 2.
 */

export default function ApprovalPage(): JSX.Element {
  return (
    <section style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1>Approvals</h1>
      <p style={{ opacity: 0.6 }}>
        Pending approvals will appear here. (Substrate placeholder.)
      </p>
    </section>
  );
}
