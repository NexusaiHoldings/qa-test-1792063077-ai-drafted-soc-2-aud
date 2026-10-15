/**
 * Site media data access (visual-audio-video-team-001 phase 5).
 *
 * Server-only reads of the company's own site_media table. Same externalized
 * `pg` pattern as lib/blog.ts (pool created at first call so preview builds
 * without a DB still compile). Returns null on any error / missing row so a
 * surface that lacks media simply renders nothing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pool: any = null;

function getPool(): {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
} {
  if (_pool) return _pool;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool: PgPool } = require("pg") as {
    Pool: new (config: Record<string, unknown>) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
  };
  _pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return _pool;
}

export async function getSiteMedia(key: string): Promise<string | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT url FROM site_media WHERE key = $1 LIMIT 1`,
      [key],
    );
    const r = rows[0] as Record<string, unknown> | undefined;
    return r && r.url ? String(r.url) : null;
  } catch {
    return null;
  }
}
