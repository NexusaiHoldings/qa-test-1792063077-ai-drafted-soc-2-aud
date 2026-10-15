/**
 * /crm/[id] — contact detail (ADMIN, substrate-lego-wiring-001 Phase 2).
 * Mounts @nexus/crm-and-lifecycle ContactSidebar (history + AI next action).
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactSidebar } from "@nexus/crm-and-lifecycle/ui/ContactSidebar";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ContactPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <Link href="/crm" className="text-sm text-blue-600 underline">
        ← All contacts
      </Link>
      <ContactSidebar contactId={params.id} />
    </main>
  );
}
