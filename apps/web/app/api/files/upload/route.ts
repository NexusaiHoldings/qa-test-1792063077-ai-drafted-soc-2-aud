/**
 * POST /api/files/upload — upload a file (multipart) for the session user.
 * Substrate storage backend for @nexus/files-and-media (substrate-lego-wiring-001).
 *
 * Reads the file bytes, stores them in the company DB (file_blobs), then
 * registers metadata via the lego's handleRegisterFile (storage_key = blob id).
 * No AV scanner is wired, so scan_status is marked 'skipped' (honest).
 */
import { NextResponse } from "next/server";
import { handleRegisterFile } from "@nexus/files-and-media";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";
import { getSessionUser } from "@/lib/admin-auth";
import { storeBlob } from "@/lib/file-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  const arrayBuf = await file.arrayBuffer();
  if (arrayBuf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 10MB)" }, { status: 413 });
  }
  const bytes = Buffer.from(arrayBuf);
  const contentType = file.type || "application/octet-stream";

  const storageKey = await storeBlob(bytes, contentType);

  const result = await handleRegisterFile(
    { db: buildDb(), events: buildEventBus() },
    {
      user_id: user.id,
      filename: file.name || "upload",
      mime_type: contentType,
      size_bytes: bytes.length,
      storage_key: storageKey,
    },
  );

  if (result.status >= 200 && result.status < 300) {
    // No virus scanner is wired — mark the scan as skipped rather than leaving
    // it forever 'pending' (which would imply a scan is coming).
    try {
      await buildDb().execute(
        `UPDATE files SET scan_status = 'skipped' WHERE storage_key = $1`,
        storageKey,
      );
    } catch {
      /* non-fatal — metadata is registered regardless */
    }
    return NextResponse.json(result.body, { status: result.status });
  }
  return typeof result.body === "string"
    ? new NextResponse(result.body, { status: result.status })
    : NextResponse.json(result.body, { status: result.status });
}
