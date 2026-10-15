/**
 * file-storage — substrate v1 blob storage (substrate-lego-wiring-001 files gap-fill).
 *
 * Stores file bytes in the company's own Neon DB (`file_blobs`, bytea). The
 * @nexus/files-and-media lego owns metadata (`files.storage_key` references a
 * blob id here). Size is capped at the API layer (10MB). Production upgrade
 * path: swap these two functions for Vercel Blob / S3 signed-URL — the lego
 * and the route shims don't change, only where bytes live.
 */
import { buildDb } from "@/lib/db";

export async function storeBlob(bytes: Buffer, contentType: string): Promise<string> {
  const db = buildDb();
  const rows = await db.query<{ id: string }>(
    `INSERT INTO file_blobs (content_type, byte_size, bytes) VALUES ($1, $2, $3) RETURNING id`,
    contentType,
    bytes.length,
    bytes,
  );
  return rows[0].id;
}

export async function readBlob(
  key: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const db = buildDb();
  const rows = await db.query<{ bytes: Buffer; content_type: string }>(
    `SELECT bytes, content_type FROM file_blobs WHERE id = $1`,
    key,
  );
  if (rows.length === 0) return null;
  return { bytes: rows[0].bytes, contentType: rows[0].content_type };
}
