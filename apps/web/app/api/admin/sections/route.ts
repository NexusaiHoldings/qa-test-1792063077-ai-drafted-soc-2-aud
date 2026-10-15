/** GET /api/admin/sections — admin nav sections for the AdminShell sidebar.
 *
 * Merges the substrate's ALWAYS-MOUNTED admin pages (static) with any
 * lego-registered sections from the DB (admin_sections). Pre-fix the sidebar was
 * purely DB-registry-driven and admin_sections is unseeded, so NO admin page
 * appeared in the nav — the chairman had to know the URLs. The static list
 * guarantees the mounted pages are always discoverable. (admin-users-001) */
import { handleListSections } from "@nexus/admin-console";
import { requireAdmin, adminCtx, tok } from "@/lib/admin-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Section {
  id: string;
  lego_name: string;
  section_name: string;
  section_order: number;
  routes: string[];
}

// The substrate's mounted admin pages — always present in the sidebar.
const STATIC_SECTIONS: Section[] = [
  { id: "users", lego_name: "identity-and-access", section_name: "Users", section_order: 1, routes: ["/admin/users"] },
  { id: "data", lego_name: "product-data", section_name: "Product Data", section_order: 5, routes: ["/admin/data"] },
  { id: "feature-flags", lego_name: "admin-console", section_name: "Feature Flags", section_order: 10, routes: ["/admin/feature-flags"] },
  { id: "system-config", lego_name: "admin-console", section_name: "System Config", section_order: 11, routes: ["/admin/system-config"] },
  { id: "audit-log", lego_name: "admin-console", section_name: "Audit Log", section_order: 12, routes: ["/admin/audit-log"] },
  { id: "feedback", lego_name: "feedback", section_name: "Feedback", section_order: 25, routes: ["/admin/feedback"] },
  { id: "legal", lego_name: "legal-and-compliance", section_name: "Legal", section_order: 30, routes: ["/admin/legal"] },
  { id: "billing", lego_name: "billing-and-subscriptions", section_name: "Billing", section_order: 40, routes: ["/admin/billing"] },
  { id: "analytics", lego_name: "analytics-and-telemetry", section_name: "Analytics", section_order: 60, routes: ["/admin/analytics"] },
];

export async function GET(): Promise<Response> {
  const g = await requireAdmin();
  if (!g.admin) return g.response;

  // Best-effort lego/DB sections (may be empty if admin_sections isn't seeded).
  let dynamic_: Section[] = [];
  try {
    const result = await handleListSections({ adminTokenHeader: tok(), adminToken: tok(), ctx: adminCtx() });
    if (result.status === 200 && typeof result.body === "object" && result.body) {
      const arr = (result.body as { sections?: unknown }).sections;
      if (Array.isArray(arr)) dynamic_ = arr as Section[];
    }
  } catch {
    /* DB registry unavailable — fall back to static only */
  }

  // Merge, dedup by first route, sort by order.
  const byRoute = new Map<string, Section>();
  for (const s of [...STATIC_SECTIONS, ...dynamic_]) {
    const key = (s.routes && s.routes[0]) || s.section_name;
    if (!byRoute.has(key)) byRoute.set(key, s);
  }
  const sections = [...byRoute.values()].sort((a, b) => a.section_order - b.section_order);
  return NextResponse.json({ sections });
}
