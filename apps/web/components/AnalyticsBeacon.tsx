"use client";

/**
 * AnalyticsBeacon — emits a page_view event on every route change
 * (substrate-lego-wiring-001 Phase 4). This is the client instrumentation the
 * analytics lego needs — without it analytics_events stays empty and the
 * dashboard has no data. Renders nothing. Fire-and-forget; failures are
 * swallowed so analytics never affects the page.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function AnalyticsBeacon(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const controller = new AbortController();
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "page_view", properties: { path: pathname } }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {
      /* analytics is best-effort — never surface errors to the user */
    });
    return () => controller.abort();
  }, [pathname]);

  return null;
}
