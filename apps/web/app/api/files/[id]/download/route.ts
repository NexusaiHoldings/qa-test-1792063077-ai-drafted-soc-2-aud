/**
 * GET /api/files/[id]/download — stream a file's bytes back to its owner.
 * Substrate storage backend for @nexus/files-and-media (substrate-lego-wiring-001).
 * Ownership-scoped: a user can only download their own, non-deleted files.
 */
import { NextResponse } from "next/server";
import { buildDb } from "@/lib/db";
import { getSessionUser } from "@/lib/admin-auth";
import { readBlob } from "@/lib/file-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface FileRow {
  storage_key: string;
  filename: string;
  mime_type: string;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await buildDb().query<FileRow>(
    `SELECT storage_key, filename, mime_type FROM files
      WHERE id = $1 AND user_id = $2 AND status <> 'deleted'`,
    params.id,
    user.id,
  );
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  const blob = await readBlob(rows[0].storage_key);
  if (!blob) return NextResponse.json({ error: "file contents missing" }, { status: 404 });

  const safeName = rows[0].filename.replace(/["\\\r\n]/g, "_");
  // A Buffer is a valid response body at runtime, but TS's BodyInit is strict
  // about the ArrayBuffer backing type (ArrayBufferLike ≠ ArrayBuffer), so we
  // cast. Same bytes, no copy.
  return new NextResponse(blob.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": blob.contentType || rows[0].mime_type || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "content-length": String(blob.bytes.length),
    },
  });
}
