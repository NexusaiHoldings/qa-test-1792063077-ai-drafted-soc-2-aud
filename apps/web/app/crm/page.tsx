/**
 * /crm — contacts / pipeline dashboard (ADMIN, substrate-lego-wiring-001 Phase 2).
 *
 * CRM is an internal sales tool, not an end-user surface, so this page is
 * admin-gated. The CRM lego ships no list component, so the substrate
 * server-renders the contact list (via handleListContacts) linking to
 * /crm/[id] where the lego's ContactSidebar renders the detail. The public
 * LeadCaptureForm component remains available for companies to embed on
 * marketing pages (posts to the public /api/crm/leads).
 */
import type { JSX } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { handleListContacts } from "@nexus/crm-and-lifecycle";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getAdminUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ContactRow {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  stage: string;
  lead_score?: number | null;
  is_hot?: boolean;
}

export default async function CrmPage(): Promise<JSX.Element> {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  let contacts: ContactRow[] = [];
  try {
    const result = await handleListContacts(
      { db: buildDb(), events: buildEventBus() },
      { limit: 200 },
    );
    if (result.status === 200 && typeof result.body === "object") {
      contacts = ((result.body as { contacts?: ContactRow[] }).contacts) ?? [];
    }
  } catch {
    contacts = [];
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">CRM — Contacts</h1>
      {contacts.length === 0 ? (
        <p className="text-gray-600">
          No contacts yet. Leads captured via your marketing forms (POST <code>/api/crm/leads</code>)
          appear here, scored and triaged by the agent.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200 text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Company</th>
              <th className="p-2">Stage</th>
              <th className="p-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-2">
                  <Link href={`/crm/${encodeURIComponent(c.id)}`} className="font-medium text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                  {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                </td>
                <td className="p-2 text-gray-700">{c.company ?? "—"}</td>
                <td className="p-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {c.stage}
                  </span>
                  {c.is_hot && <span className="ml-2 text-xs font-semibold text-red-600">HOT</span>}
                </td>
                <td className="p-2 text-gray-700">{c.lead_score ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
