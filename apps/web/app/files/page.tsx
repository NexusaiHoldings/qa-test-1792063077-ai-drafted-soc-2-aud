/**
 * /files — upload + manage files (substrate-lego-wiring-001 files gap-fill).
 * Mounts the substrate FileManager (real upload/list/download backed by
 * file_blobs in the company DB). Login required.
 */
import type { JSX } from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/admin-auth";
import { FileManager } from "@/components/files/FileManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FilesPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-600">
          Please <Link href="/login" className="text-blue-600 underline">log in</Link> to manage your files.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Files</h1>
      <FileManager />
    </main>
  );
}
