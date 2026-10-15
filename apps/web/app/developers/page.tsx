/**
 * /developers — API keys (substrate-lego-wiring-001 Phase 3).
 * Mounts @nexus/developer-surface via the substrate ApiKeyManager (list +
 * create + revoke). Webhooks are read-only API in v1 (no management UI yet).
 */
import type { JSX } from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { ApiKeyManager } from "@/components/dev/ApiKeyManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DevelopersPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to manage your API keys.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Developers</h1>
        <p className="text-sm text-gray-500">Create and manage API keys for programmatic access.</p>
      </header>
      <ApiKeyManager />
    </main>
  );
}
