/**
 * Event publisher abstraction.
 *
 * The feedback handlers emit domain events (feedback.submitted / feedback.action
 * / feedback.answer) that the substrate's buildEventBus() forwards to the
 * portfolio-runtime (lib/runtime-events.ts allow-list). Publishing is
 * fire-and-forget — implementations swallow + log errors.
 */

export interface EventBus {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

/** No-op event bus for testing and substrates without forwarding wired. */
export const NOOP_EVENT_BUS: EventBus = {
  async publish() {
    /* no-op */
  },
};
