/**
 * /org/accept?token=… — accept an org invitation (substrate-lego-wiring-001 Phase 2).
 * Server reads the token from the URL; AcceptInvitation POSTs it (user_id from session).
 */
import type { JSX } from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { AcceptInvitation } from "@/components/org/AcceptInvitation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: { token?: string };
}): Promise<JSX.Element> {
  const token = searchParams.token ?? "";
  const user = await getSessionUser();

  if (!user) {
    const next = `/org/accept${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="mb-3 text-2xl font-semibold text-gray-900">Accept invitation</h1>
        <p className="text-gray-600">
          Please{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-blue-600 underline">
            log in
          </Link>{" "}
          to accept this invitation.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-center">
      <h1 className="mb-3 text-2xl font-semibold text-gray-900">Accept invitation</h1>
      <p className="mb-6 text-gray-600">You&apos;ve been invited to join an organization.</p>
      <AcceptInvitation token={token} />
    </main>
  );
}
