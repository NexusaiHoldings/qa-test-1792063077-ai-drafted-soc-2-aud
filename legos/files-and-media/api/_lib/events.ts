/**
 * Event publisher abstraction.
 *
 * Legos emit domain events (e.g., "user.signed_in") that the substrate
 * relays to portfolio-runtime, analytics-and-telemetry lego, etc. The
 * substrate provides the concrete implementation (NATS publisher, PostHog
 * track, or a no-op for testing).
 */

export interface EventBus {
  /**
   * Publish an event. Subject is dot-notation (e.g., "user.signed_in").
   * Payload must be JSON-serializable. Publishing is fire-and-forget —
   * implementations should swallow errors and log internally so handler
   * failure modes don't depend on event-bus availability.
   */
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

/** No-op event bus for testing and substrates without analytics wired. */
export const NOOP_EVENT_BUS: EventBus = {
  async publish() {
    /* no-op */
  },
};
