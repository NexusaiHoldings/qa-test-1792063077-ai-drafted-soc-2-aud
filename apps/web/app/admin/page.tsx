/**
 * /admin index — redirect to the first admin section (substrate-admin-surface-001).
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminIndexPage(): never {
  redirect("/admin/feature-flags");
}
