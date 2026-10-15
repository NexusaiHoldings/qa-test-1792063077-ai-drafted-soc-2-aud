/**
 * /support — the signed-in user's support tickets (substrate-lego-wiring-001 Phase 2).
 * Mounts @nexus/support-and-help TicketList. New tickets are opened via the
 * floating SupportWidget in the app shell.
 */
import type { JSX } from "react";
import Link from "next/link";
import { TicketList } from "@nexus/support-and-help/ui/TicketList";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SupportPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to view your support tickets.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Your support tickets</h1>
        <Link href="/help" className="text-sm text-blue-600 underline">Help Center</Link>
      </div>
      <TicketList userId={user.id} />
    </main>
  );
}
