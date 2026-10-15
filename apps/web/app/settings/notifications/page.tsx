import type { JSX } from "react";
import { PreferencesCenter } from "@nexus/notifications/ui/PreferencesCenter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function NotificationPreferencesPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">Notification Preferences</h1>
      <PreferencesCenter />
    </main>
  );
}
