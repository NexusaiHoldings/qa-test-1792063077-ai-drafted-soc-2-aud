/**
 * Database adapter — thin abstraction over the substrate's DB client.
 *
 * Mirrors the shared lego Db interface (see @nexus/notifications): handlers
 * receive a `Db` from the host substrate (apps/web/lib/db.ts) at invocation
 * time and call the abstract interface, keeping the lego portable.
 */

export type DbRow = Record<string, unknown>;

export interface Db {
  /** Parameterized SELECT-style query ($1, $2, ... asyncpg-compatible). */
  query<T = DbRow>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** Parameterized INSERT/UPDATE/DELETE; use RETURNING + query() for row data. */
  execute(sql: string, ...params: unknown[]): Promise<void>;
}
