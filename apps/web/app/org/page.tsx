/**
 * /org — organization members + invite (substrate-lego-wiring-001 Phase 2).
 *
 * Mounts @nexus/organizations-and-teams. The org lego has no "list my orgs"
 * handler and nothing auto-creates an org, so the substrate resolves the
 * user's org server-side and creates a default one on first visit (the user
 * becomes its owner). MembersTable + a substrate invite form render the org.
 */
import type { JSX } from "react";
import Link from "next/link";
import { MembersTable } from "@nexus/organizations-and-teams/ui/MembersTable";
import { handleCreateOrg } from "@nexus/organizations-and-teams";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { InviteMemberForm } from "@/components/org/InviteMemberForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface OrgRow {
  id: string;
  name: string;
}

async function resolveOrgs(userId: string): Promise<OrgRow[]> {
  const db = buildDb();
  return db.query<OrgRow>(
    `SELECT o.id, o.name
       FROM organizations o
       JOIN org_members m ON m.org_id = o.id
      WHERE m.user_id = $1
      ORDER BY o.created_at ASC`,
    userId,
  );
}

export default async function OrgPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to manage your organization.
        </p>
      </main>
    );
  }

  let orgs = await resolveOrgs(user.id);
  if (orgs.length === 0) {
    const companyName = process.env.COMPANY_NAME || "My";
    await handleCreateOrg(
      { db: buildDb(), events: buildEventBus() },
      { name: `${companyName} Team`, owner_user_id: user.id },
    );
    orgs = await resolveOrgs(user.id);
  }

  const current = orgs[0];
  if (!current) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">Couldn&apos;t load your organization. Please refresh to try again.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">{current.name}</h1>

      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Members</h2>
        <MembersTable orgId={current.id} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Invite a teammate</h2>
        <InviteMemberForm orgId={current.id} />
      </section>
    </main>
  );
}
