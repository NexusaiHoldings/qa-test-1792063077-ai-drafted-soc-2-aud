/**
 * Database client — Drizzle ORM over Postgres.
 *
 * Schema is the UNION of all lego schemas (under legos/<name>/schema/*.sql)
 * + company-specific tables under packages/db/company/. Drizzle migrations
 * run at provisioning `db_setup` step against the company's Neon DB.
 *
 * Per spec §4: each lego's schema/ directory contains idempotent,
 * namespaced migrations. The substrate concatenates these in dependency
 * order at install time.
 */

export const SCHEMA_VERSION = "0.1.0";

// Schema exports land here once the schema generator wires lego schemas.
// Substrate ships with an empty schema; per-company runs populate it
// via _substrate_installer's schema-concatenation step.
export {};
