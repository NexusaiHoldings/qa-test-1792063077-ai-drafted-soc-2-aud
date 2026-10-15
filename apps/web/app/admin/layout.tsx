/**
 * /admin layout — server-side admin gate (substrate-admin-surface-001).
 *
 * Verifies the session user is an allow-listed admin BEFORE rendering any
 * admin page. Non-admins (anonymous or non-allow-listed) are sent to /login.
 * Each /api/admin/* shim re-checks independently (defense in depth).
 */

import type { JSX, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { AdminFrame } from "./AdminFrame";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const admin = await getAdminUser();
  if (!admin) {
    redirect("/login?redirect=/admin");
  }
  return <AdminFrame adminUser={admin}>{children}</AdminFrame>;
}
