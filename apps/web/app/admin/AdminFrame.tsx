/**
 * Client wrapper around the lego AdminShell (substrate-admin-surface-001).
 *
 * Supplies the current path (usePathname) and the admin user to the lego's
 * AdminShell, and sets window.__ADMIN_TOKEN__ so the lego's client fetches
 * include an X-Admin-Token header. NOTE: the /api/admin/* shims IGNORE that
 * header and authorize by session cookie instead — the value here is a
 * placeholder, never the real admin token.
 */

"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminShell } from "@nexus/admin-console/ui/AdminShell";

export function AdminFrame({
  adminUser,
  children,
}: {
  adminUser: { id: string; email: string };
  children: ReactNode;
}): JSX.Element {
  if (typeof window !== "undefined") {
    (window as unknown as { __ADMIN_TOKEN__?: string }).__ADMIN_TOKEN__ = "session";
  }
  const pathname = usePathname() || "/admin";
  return (
    <AdminShell
      currentPath={pathname}
      adminUser={adminUser}
      onExit={() => {
        window.location.href = "/";
      }}
    >
      {children}
    </AdminShell>
  );
}
