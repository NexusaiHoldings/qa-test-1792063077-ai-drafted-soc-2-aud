/**
 * /admin/analytics — analytics dashboard (ADMIN).
 * Mounts @nexus/analytics-and-telemetry AnalyticsDashboard, which reads the
 * rich /api/analytics/summary aggregate. Substrate element defaults + helpers
 * only (no Tailwind in this app — utility classes would be dead code).
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "@nexus/analytics-and-telemetry/ui/AnalyticsDashboard";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AnalyticsPage(): Promise<JSX.Element> {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  return (
    <main>
      <nav aria-label="Breadcrumb" style={{ marginBottom: "1rem" }}>
        <Link href="/admin" style={{ fontSize: "0.9rem" }}>
          ← Admin
        </Link>
      </nav>
      <span className="eyebrow">Analytics</span>
      <h1 style={{ marginBottom: "0.25rem" }}>Product analytics</h1>
      <p className="muted" style={{ marginTop: 0, maxWidth: "44rem" }}>
        How people are using the product — page views, active days, and the pages drawing the
        most traffic — recorded first-party in this app&rsquo;s own database.
      </p>
      <div style={{ marginTop: "1.5rem" }}>
        <AnalyticsDashboard />
      </div>
    </main>
  );
}
