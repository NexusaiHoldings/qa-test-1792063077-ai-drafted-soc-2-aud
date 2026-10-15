/**
 * Work Surface (spec §6.2) — list of in-flight tasks the agent is running.
 *
 * Substrate placeholder. Real implementation wires to portfolio-runtime's
 * task list in Phase 2.
 */

export default function WorkPage(): JSX.Element {
  return (
    <section style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <h1>Work</h1>
      <p style={{ opacity: 0.6 }}>
        In-flight tasks will appear here. (Substrate placeholder.)
      </p>
    </section>
  );
}
