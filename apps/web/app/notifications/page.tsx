import type { JSX } from "react";
import { InAppInbox } from "@nexus/notifications/ui/InAppInbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function NotificationsPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">Notifications</h1>
      <InAppInbox />
    </main>
  );
}
