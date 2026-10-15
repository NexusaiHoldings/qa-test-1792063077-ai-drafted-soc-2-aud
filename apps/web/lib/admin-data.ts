/**
 * Generic product-data admin — schema introspection + safe identifier handling
 * (admin-data-001).
 *
 * The "operate the business" surface: lets an admin browse and edit the rows of
 * the company's OWN domain tables (e.g. CondoCentral's `violations`, Verifolio's
 * `proposals`) without a bespoke admin per company. It is generic — it reflects
 * over information_schema at request time.
 *
 * SECURITY: table and column names cannot be SQL-parameterized (they're
 * identifiers, not values). The ONLY safe pattern is to validate every
 * client-supplied identifier against the live catalog on EACH request, then
 * double-quote the catalog-confirmed identifier. Values are always bound ($1…).
 * Never interpolate a value. Platform/lego-owned tables are excluded so this
 * surface only exposes the company's product data.
 */

import type { Db } from "@nexus/identity-and-access/api/_lib/db";

/**
 * Exact table names owned by the platform / substrate / the 16 legos — enumerated
 * from every `CREATE TABLE` in `legos/&#42;/schema/&#42;.sql` + the substrate's own
 * `packages/db/company/{blog,site-media}.ts`. Anything NOT in this set (and not
 * caught by a prefix below) is treated as a company PRODUCT table. Keeping this
 * exact keeps the Product Data admin precise — it won't hide a company's own
 * table just because it shares a word with a platform one.
 */
const DENY_EXACT = new Set<string>([
  // identity-and-access
  "users", "sessions", "password_reset_tokens", "mfa_factors",
  "mfa_recovery_codes", "oauth_identities", "login_history",
  // profile-and-account
  "user_profiles", "profiles", "connected_accounts", "account_export_requests",
  // organizations-and-teams
  "organizations", "org_members", "org_invitations", "org_audit_log",
  // billing-and-subscriptions
  "billing_customers", "billing_subscriptions", "billing_checkout_sessions",
  "billing_webhook_events", "billing_usage_events", "billing_usage_summaries",
  "billing_plan_changes", "billing_dunning_state",
  // legal-and-compliance
  "legal_documents", "legal_acknowledgments", "cookie_consents",
  // notifications
  "notification_log", "notification_preferences", "web_push_subscriptions",
  // admin-console
  "admin_sections", "admin_audit_log", "feature_flags", "system_config",
  // analytics-and-telemetry
  "analytics_events", "analytics_funnels",
  // support-and-help
  "support_tickets", "support_messages", "support_feedback", "kb_articles",
  // crm-and-lifecycle
  "crm_contacts", "crm_interactions", "crm_outreach_drafts",
  // developer-surface
  "api_keys", "api_request_log", "webhooks",
  // files-and-media + search
  "file_blobs", "files", "file_extractions", "search_index", "saved_searches",
  // social-and-engagement
  "social_comments", "social_reactions", "social_referrals",
  // onboarding
  "onboarding_progress", "onboarding_sample_data_runs",
  // memory-and-knowledge (portfolio runtime)
  "portfolio_runtime_memory", "portfolio_knowledge_compiler_runs",
  "portfolio_memory_forget_log",
  // substrate-owned company-db tables (marketing/media — every company has these)
  "blog_posts", "site_media",
  // provisioning / migration bookkeeping
  "company_profiles", "schema_migrations", "migrations",
]);

/**
 * Prefixes for platform / lego table families — defense against NEW variant
 * tables a lego adds after this snapshot. Deliberately limited to families no
 * plausible company product table would use, so we don't hide real product data.
 */
const DENY_PREFIXES = [
  "billing_", "mfa_", "oauth_", "analytics_", "admin_", "notification_",
  "portfolio_", "password_", "pg_", "_",
];

function isExcluded(name: string): boolean {
  if (DENY_EXACT.has(name)) return true;
  return DENY_PREFIXES.some((p) => name.startsWith(p));
}

/** Double-quote a catalog-confirmed identifier. Defense in depth: reject any
 *  name containing a double-quote (a real Postgres identifier from the catalog
 *  never will). Callers MUST validate the name against the catalog first. */
export function quoteIdent(name: string): string {
  if (name.includes('"')) throw new Error("illegal identifier");
  return `"${name}"`;
}

export interface ColumnMeta {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  is_pk: boolean;
  editable: boolean;
}

export interface DomainTable {
  name: string;
  columns: ColumnMeta[];
  /** Single-column primary key, or null (composite/none → read-only). */
  pk: string | null;
}

/** udt_names that text-assignment coercion handles, so `"col" = $n` is safe. */
const EDITABLE_UDT = new Set<string>([
  "text", "varchar", "bpchar", "name", "citext",
  "int2", "int4", "int8", "float4", "float8", "numeric",
  "bool", "uuid", "date", "timestamp", "timestamptz", "time", "timetz",
]);

export interface TableSummary {
  name: string;
  rows: number;
  columns: number;
}

/** List the company's product (domain) tables with row + column counts. */
export async function listDomainTables(db: Db): Promise<TableSummary[]> {
  const tables = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables " +
      "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' " +
      "ORDER BY table_name",
  );
  const colCounts = await db.query<{ table_name: string; n: string }>(
    "SELECT table_name, COUNT(*)::text AS n FROM information_schema.columns " +
      "WHERE table_schema = 'public' GROUP BY table_name",
  );
  const colMap = new Map(colCounts.map((r) => [r.table_name, Number(r.n)]));

  const domain = tables
    .map((t) => t.table_name)
    .filter((name) => !isExcluded(name));

  const out: TableSummary[] = [];
  for (const name of domain) {
    let rows = 0;
    try {
      const r = await db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${quoteIdent(name)}`,
      );
      rows = Number(r[0]?.n || 0);
    } catch {
      rows = -1; // count failed; still list the table
    }
    out.push({ name, rows, columns: colMap.get(name) || 0 });
  }
  return out;
}

/**
 * Resolve a client-supplied table name to its validated metadata, or null if it
 * is not a known product table (excluded names + nonexistent names both → null).
 */
export async function getDomainTable(
  db: Db,
  name: string,
): Promise<DomainTable | null> {
  if (typeof name !== "string" || !name || isExcluded(name)) return null;

  const cols = await db.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
  }>(
    "SELECT column_name, data_type, udt_name, is_nullable " +
      "FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = $1 " +
      "ORDER BY ordinal_position",
    name,
  );
  if (cols.length === 0) return null; // not a real table

  const pkRows = await db.query<{ column_name: string }>(
    "SELECT kcu.column_name FROM information_schema.table_constraints tc " +
      "JOIN information_schema.key_column_usage kcu " +
      "  ON kcu.constraint_name = tc.constraint_name " +
      "  AND kcu.table_schema = tc.table_schema " +
      "WHERE tc.table_schema = 'public' AND tc.table_name = $1 " +
      "  AND tc.constraint_type = 'PRIMARY KEY'",
    name,
  );
  const pk = pkRows.length === 1 ? pkRows[0].column_name : null;
  const pkSet = new Set(pkRows.map((r) => r.column_name));

  const columns: ColumnMeta[] = cols.map((c) => ({
    name: c.column_name,
    data_type: c.data_type,
    udt_name: c.udt_name,
    is_nullable: c.is_nullable === "YES",
    is_pk: pkSet.has(c.column_name),
    // PK is never editable; otherwise editable iff a text-coercible scalar.
    editable: !pkSet.has(c.column_name) && EDITABLE_UDT.has(c.udt_name),
  }));

  return { name, columns, pk };
}
