/** File handlers — files-and-media lego. Framework-agnostic. */
import type { HandlerContext, HandlerResult } from "./_lib/handler";
import { ok, err } from "./_lib/handler";
import type { DbRow } from "./_lib/db";

/** POST /api/files — register an uploaded file (storage handled by substrate). */
export async function handleRegisterFile(
  ctx: HandlerContext,
  body: { user_id?: string; filename?: string; mime_type?: string; size_bytes?: number; storage_key?: string },
): Promise<HandlerResult> {
  if (!body.filename || !body.mime_type || !body.storage_key) {
    return err(400, "filename, mime_type, storage_key required");
  }
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO files (user_id, filename, mime_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, scan_status`,
    body.user_id ?? null, body.filename, body.mime_type, body.size_bytes ?? 0, body.storage_key,
  );
  await ctx.events.publish("file.uploaded", { file_id: rows[0].id, mime_type: body.mime_type });
  return ok({ file_id: rows[0].id, scan_status: rows[0].scan_status }, 201);
}

/** GET /api/files?user_id= — list a user's active files. */
export async function handleListFiles(
  ctx: HandlerContext,
  userId: string,
): Promise<HandlerResult> {
  if (!userId) return err(400, "user_id is required");
  const rows = await ctx.db.query<DbRow>(
    `SELECT id, filename, mime_type, size_bytes, category, scan_status, status, created_at
     FROM files WHERE user_id = $1 AND status <> 'deleted' ORDER BY created_at DESC`,
    userId,
  );
  return ok({ files: rows, count: rows.length });
}

/** POST /api/files/{id}/extraction — persist an agent extraction. */
export async function handleSaveExtraction(
  ctx: HandlerContext,
  fileId: string,
  body: { kind?: string; extracted?: Record<string, unknown> },
): Promise<HandlerResult> {
  if (!fileId) return err(400, "file id is required");
  const exists = await ctx.db.query<DbRow>(`SELECT id FROM files WHERE id = $1`, fileId);
  if (exists.length === 0) return err(404, "file not found");
  const rows = await ctx.db.query<DbRow>(
    `INSERT INTO file_extractions (file_id, kind, extracted)
     VALUES ($1, $2, $3::jsonb) RETURNING id`,
    fileId, body.kind ?? "structured_data", JSON.stringify(body.extracted ?? {}),
  );
  return ok({ extraction_id: rows[0].id }, 201);
}

/**
 * POST /api/files/{id}/quarantine — quarantine a file.
 * Server-side mutation behind the quarantine_file agent tool (confirm).
 */
export async function handleQuarantineFile(
  ctx: HandlerContext,
  fileId: string,
  body: { reason?: string },
): Promise<HandlerResult> {
  if (!fileId) return err(400, "file id is required");
  const rows = await ctx.db.query<DbRow>(
    `UPDATE files SET status = 'quarantined' WHERE id = $1 AND status <> 'deleted'
     RETURNING id, status`,
    fileId,
  );
  if (rows.length === 0) return err(404, "file not found");
  await ctx.events.publish("file.quarantined", { file_id: fileId, reason: body.reason ?? null });
  return ok({ file_id: fileId, status: "quarantined" });
}
