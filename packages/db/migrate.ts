#!/usr/bin/env node
/**
 * Substrate DB migration runner — Sprint substrate-db-migration-runner-001 (2026-05-21).
 *
 * Reads all `*_DDL` / `*_SCHEMA_SQL` constants from `packages/db/company/*.ts`
 * and executes them in sequence against `DATABASE_URL`.
 *
 * Runs as a turbo `migrate` task BEFORE `web#build` (per root turbo.json
 * dependsOn chain) so the database has its tables before Next.js's static
 * generation or any server-component pre-render queries the DB.
 *
 * Idempotent: relies on CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * in the DDL constants. Safe to re-run on every build.
 *
 * Failure modes:
 *   - DATABASE_URL not set, VERCEL_ENV=production → exit 1, build fails LOUD
 *     (provisioning-database-url-injection-fix-001: an unmigrated production
 *     DB must surface at deploy time, not via a post-deploy audit)
 *   - DATABASE_URL not set, preview/dev          → warn + exit 0 (no DB is OK)
 *   - DB connection fails     → exit 1, build fails (Vercel surfaces error)
 *   - DDL SQL error           → exit 1, build fails
 *   - No DDL constants found  → exit 0 (substrate without per-company tables)
 *
 * Live evidence (Verifolio, 2026-05-21): pre-fix the substrate's packages/db/
 * index.ts was a stub. Verifolio's Neon DB had ZERO tables. F1-003's /templates
 * page queried coi_compliance_templates → asyncpg.UndefinedColumnError → HTTP
 * 500. This script closes that gap by running the DDL at build time.
 */

import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";

interface DdlEntry {
  file: string;
  constant: string;
  sql: string;
}

interface LegoSchemaEntry {
  lego: string;
  file: string;
  sql: string;
}

/**
 * Collect every `legos/<lego>/schema/*.sql` file bundled with the substrate.
 *
 * Sprint buildspec-auth-fix-001 (2026-06-01). Pre-fix this runner applied ONLY
 * `packages/db/company/*.ts` DDL constants — the bundled legos' own schema
 * (users / sessions / billing_* / etc.) was never created in the company DB.
 * Live evidence (Buildspec): POST /api/auth/login → 500 because `users` did
 * not exist; the auth-gated pages then redirected to a non-existent login page
 * → 405. This closes the schema half of that gap.
 *
 * Returned sorted by (lego, file) so per-lego filename order (001 → 002 → 003)
 * is preserved — within-lego FKs depend on it. No cross-lego FKs exist, so
 * lego order itself is irrelevant. Every schema file is idempotent
 * (CREATE TABLE/INDEX IF NOT EXISTS), so this is safe to run on every build.
 */
function collectLegoSchemas(): LegoSchemaEntry[] {
  const legosDir = resolve(__dirname, "..", "..", "legos");
  let legoNames: string[];
  try {
    legoNames = readdirSync(legosDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    console.log(`[db/migrate] No legos/ directory at ${legosDir} — skipping lego schemas`);
    return [];
  }

  const entries: LegoSchemaEntry[] = [];
  for (const lego of legoNames) {
    const schemaDir = join(legosDir, lego, "schema");
    let sqlFiles: string[];
    try {
      sqlFiles = readdirSync(schemaDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      continue; // lego has no schema/ dir
    }
    for (const file of sqlFiles) {
      const sql = readFileSync(join(schemaDir, file), "utf8");
      if (sql.trim().length > 0) {
        entries.push({ lego, file, sql });
      }
    }
  }
  return entries;
}

interface SeedClient {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Seed the admin-console nav sections so AdminShell's nav lists the bundled
 * admin pages (the lego ships the tables but seeds no sections). Idempotent
 * via UNIQUE (lego_name, section_name). Best-effort — never throws.
 *
 * Sprint substrate-admin-surface-001 (2026-06-01).
 */
async function seedAdminSections(client: SeedClient): Promise<void> {
  const sections: Array<{ name: string; order: number; routes: string[] }> = [
    { name: "Feature Flags", order: 10, routes: ["/admin/feature-flags"] },
    { name: "System Config", order: 20, routes: ["/admin/system-config"] },
    { name: "Audit Log", order: 30, routes: ["/admin/audit-log"] },
  ];
  for (const s of sections) {
    try {
      await client.query(
        `INSERT INTO admin_sections (lego_name, section_name, section_order, permissions, routes)
         VALUES ('admin-console', $1, $2, $3, $4)
         ON CONFLICT (lego_name, section_name)
         DO UPDATE SET section_order = EXCLUDED.section_order, routes = EXCLUDED.routes`,
        [s.name, s.order, ["admin"], s.routes],
      );
      console.log(`[db/migrate]   seeded admin section "${s.name}"`);
    } catch (err) {
      console.warn(`[db/migrate]   WARN seed admin section "${s.name}" (non-fatal): ${err}`);
    }
  }
}

/**
 * Seed two fixed test accounts into EVERY build for testing:
 *   - testuser@nexusaiholdings.com  (regular user)
 *   - admintest@nexusaiholdings.com (admin — must be in ADMIN_EMAILS to reach /admin)
 *
 * Passwords default to TestUser!2026 / AdminTest!2026 (override via
 * TEST_USER_PASSWORD / ADMIN_TEST_PASSWORD). Hashing reuses the identity
 * lego's scrypt hashPassword so the seeded hash verifies on login. Idempotent
 * (ON CONFLICT (email) DO NOTHING). Best-effort — never throws.
 *
 * Gated by SEED_TEST_USERS (default "true"). SECURITY: set SEED_TEST_USERS=false
 * before any real customer launch — these are incubation-phase test accounts.
 *
 * Sprint substrate-admin-surface-001 (2026-06-01).
 */
async function seedTestUsers(client: SeedClient): Promise<void> {
  if ((process.env.SEED_TEST_USERS || "true").toLowerCase() === "false") {
    console.log("[db/migrate] SEED_TEST_USERS=false — skipping test-user seed");
    return;
  }

  const cryptoPath = resolve(
    __dirname,
    "..",
    "..",
    "legos",
    "identity-and-access",
    "api",
    "_lib",
    "crypto.ts",
  );
  let hashPassword: (plain: string) => string;
  try {
    const mod = (await import(pathToFileURL(cryptoPath).href)) as {
      hashPassword: (plain: string) => string;
    };
    hashPassword = mod.hashPassword;
  } catch (err) {
    console.warn(`[db/migrate] WARN cannot import hashPassword — skipping test-user seed: ${err}`);
    return;
  }

  const accounts: Array<{ email: string; password: string }> = [
    {
      email: "testuser@nexusaiholdings.com",
      password: process.env.TEST_USER_PASSWORD || "TestUser!2026",
    },
    {
      email: "admintest@nexusaiholdings.com",
      password: process.env.ADMIN_TEST_PASSWORD || "AdminTest!2026",
    },
  ];
  for (const a of accounts) {
    try {
      await client.query(
        `INSERT INTO users (email, password_hash, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (email) DO NOTHING`,
        [a.email, hashPassword(a.password)],
      );
      console.log(`[db/migrate]   seeded test user ${a.email}`);
    } catch (err) {
      console.warn(`[db/migrate]   WARN seed test user ${a.email} (non-fatal): ${err}`);
    }
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // provisioning-database-url-injection-fix-001 (2026-06-09): a missing
    // DATABASE_URL on a PRODUCTION build is a deploy-blocking error, not a
    // silent skip. The Verifolio incident shipped a live company with an empty
    // DB because this path exited 0 silently — the unmigrated DB was caught
    // only by a post-deploy audit. On production targets we now FAIL the build
    // loud so a provisioning env-injection gap surfaces at deploy time.
    // Preview/dev deploys legitimately have no DB → loud warning, exit 0.
    if (process.env.VERCEL_ENV === "production") {
      console.error(
        "[db/migrate] FATAL: DATABASE_URL is not set on a PRODUCTION build. " +
          "The company database cannot be migrated and the app would ship with " +
          "an empty DB (broken /dashboard, analytics, and every DB-backed page). " +
          "This almost always means provisioning failed to inject DATABASE_URL " +
          "(see provisioning-database-url-injection-fix-001). Failing the build.",
      );
      process.exit(1);
    }
    console.warn(
      "[db/migrate] WARNING: DATABASE_URL not set — skipping migration. " +
        "Expected in local dev / Vercel preview without a DB; this would be " +
        "FATAL on a production target.",
    );
    return;
  }

  // Bundled lego schemas (users / sessions / billing_* / etc.) — applied
  // BEFORE company DDL so company tables can reference lego tables.
  const legoSchemas = collectLegoSchemas();

  // Per-company DDL constants from packages/db/company/*.ts.
  const companyDir = resolve(__dirname, "company");
  const ddls: DdlEntry[] = [];
  let tsFiles: string[] = [];
  try {
    tsFiles = readdirSync(companyDir).filter((f) => f.endsWith(".ts"));
  } catch {
    console.log(`[db/migrate] No company/ directory at ${companyDir} — company DDL skipped`);
  }
  for (const file of tsFiles) {
    const fullPath = join(companyDir, file);
    let mod: Record<string, unknown>;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (err) {
      console.error(`[db/migrate] Failed to import ${file}: ${err}`);
      throw err;
    }
    for (const [name, value] of Object.entries(mod)) {
      if (
        typeof value === "string" &&
        (name.endsWith("_DDL") || name.endsWith("_SCHEMA_SQL"))
      ) {
        ddls.push({ file, constant: name, sql: value });
      }
    }
  }

  if (legoSchemas.length === 0 && ddls.length === 0) {
    console.log(
      "[db/migrate] No lego schemas and no *_DDL / *_SCHEMA_SQL constants — nothing to migrate",
    );
    return;
  }

  console.log(
    `[db/migrate] Found ${legoSchemas.length} lego schema file(s) + ${ddls.length} company DDL constant(s)`,
  );
  for (const s of legoSchemas) {
    console.log(`  - lego ${s.lego}/${s.file} (${s.sql.length} chars)`);
  }
  for (const d of ddls) {
    console.log(`  - company ${d.file}::${d.constant} (${d.sql.length} chars)`);
  }

  // Dynamic require for `pg` so tsx doesn't try to bundle Node-built-ins.
  // Same pattern apps/web uses (per compliance-evaluator.ts).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as {
    Client: new (config: { connectionString: string }) => {
      connect: () => Promise<void>;
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
      end: () => Promise<void>;
    };
  };
  const client = new Client({ connectionString: dbUrl });

  await client.connect();
  console.log("[db/migrate] Connected to DATABASE_URL");

  let legoSucceeded = 0;
  let ddlSucceeded = 0;
  const legoFailed: string[] = [];
  try {
    // Lego schemas are best-effort: applied with continue-on-error. The 16
    // bundled legos are heterogeneous — most create their own tables (users,
    // sessions, billing_*), but some ALTER Nexus-platform tables that do not
    // exist in a company DB (e.g. memory-and-knowledge ALTERs memory_items).
    // A platform-dependent lego must NOT fail the company build, so we warn
    // and continue. Company DDL below stays fatal.
    for (const s of legoSchemas) {
      console.log(`[db/migrate] Executing lego ${s.lego}/${s.file} ...`);
      try {
        await client.query(s.sql);
        legoSucceeded += 1;
        console.log(`[db/migrate]   OK lego ${s.lego}/${s.file}`);
      } catch (err) {
        legoFailed.push(`${s.lego}/${s.file}`);
        console.warn(
          `[db/migrate]   WARN skipping lego ${s.lego}/${s.file} (non-fatal): ${err}`,
        );
      }
    }
    for (const d of ddls) {
      console.log(`[db/migrate] Executing company ${d.file}::${d.constant} ...`);
      try {
        await client.query(d.sql);
        ddlSucceeded += 1;
        console.log(`[db/migrate]   OK company ${d.file}::${d.constant}`);
      } catch (err) {
        console.error(
          `[db/migrate]   FAILED company ${d.file}::${d.constant}: ${err}`,
        );
        throw err;
      }
    }

    // Best-effort seeds (admin nav sections + test users). Never fatal.
    await seedAdminSections(client);
    await seedTestUsers(client);
  } finally {
    await client.end();
  }

  console.log(
    `[db/migrate] Complete — ${legoSucceeded}/${legoSchemas.length} lego schema(s) + ${ddlSucceeded}/${ddls.length} company DDL constant(s) applied`,
  );
  if (legoFailed.length > 0) {
    console.warn(
      `[db/migrate] ${legoFailed.length} lego schema(s) skipped (non-fatal, likely platform-table dependencies): ${legoFailed.join(", ")}`,
    );
  }
}

main().catch((err) => {
  console.error("[db/migrate] FATAL:", err);
  process.exit(1);
});
