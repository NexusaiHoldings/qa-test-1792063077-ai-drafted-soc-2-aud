/**
 * Database adapter — thin abstraction over the substrate's DB client.
 *
 * Legos don't directly import a Drizzle/postgres library — instead they
 * receive a `Db` interface from the host substrate at handler-invocation
 * time. The substrate's apps/web/lib/db.ts provides the implementation;
 * legos call into the abstract interface.
 *
 * This keeps legos portable: a substrate could swap Drizzle for Prisma
 * or raw postgres-js without touching lego code.
 *
 * Shape mirrors the Python `db.query` / `db.execute` async surface from
 * the original lego implementation — minimal porting friction.
 */

export type DbRow = Record<string, unknown>;

export interface Db {
  /**
   * Run a parameterized SELECT-style query. $1, $2, ... placeholders match
   * the Python implementation's parameterization style (asyncpg compatible).
   * Result type defaults to a generic Record; callers can narrow via T.
   */
  query<T = DbRow>(sql: string, ...params: unknown[]): Promise<T[]>;

  /**
   * Run a parameterized INSERT/UPDATE/DELETE. Returns void; callers should
   * structure their SQL with RETURNING clauses + query() if they need
   * affected-row data.
   */
  execute(sql: string, ...params: unknown[]): Promise<void>;
}
