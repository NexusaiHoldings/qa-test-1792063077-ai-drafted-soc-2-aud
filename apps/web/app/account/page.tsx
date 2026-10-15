/**
 * /account — profile editor + data export (substrate-lego-wiring-001 Phase 2).
 * Mounts @nexus/profile-and-account. ConnectedAccountsPanel is intentionally
 * not mounted in v1 (no connect/disconnect handlers exist — only a read-only
 * list endpoint), so no misleading connect UI is shown.
 */
import type { JSX } from "react";
import Link from "next/link";
import { ProfileSettingsPanel } from "@nexus/profile-and-account/ui/ProfileSettingsPanel";
import { AccountExportButton } from "@nexus/profile-and-account/ui/AccountExportButton";
import { getSessionUser } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccountPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to manage your account.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
        <p className="text-sm text-gray-500">{user.email}</p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Profile</h2>
        <ProfileSettingsPanel userId={user.id} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-gray-900">Your data</h2>
        <p className="mb-3 text-sm text-gray-500">
          Request a copy of all the data we hold about your account.
        </p>
        <AccountExportButton userId={user.id} />
      </section>
    </main>
  );
}
