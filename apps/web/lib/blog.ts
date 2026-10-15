/**
 * Blog data access (gtm-marketing-launch-001).
 *
 * Server-only reads of the company's own blog_posts table. Same externalized
 * `pg` pattern as lib/db.ts (pg in serverComponentsExternalPackages, pool
 * created at first call so preview builds without a DB still compile).
 */

export interface BlogPostSummary {
  slug: string;
  title: string;
  description: string | null;
  author: string;
  published_at: string;
  tags: string[];
  hero_image_url: string | null;
  og_image_url: string | null;
}

export interface BlogPost extends BlogPostSummary {
  content_html: string;
  audio_url: string | null;
}

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

function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function listPublishedPosts(limit = 50): Promise<BlogPostSummary[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT slug, title, description, author, published_at, tags, hero_image_url, og_image_url
         FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC
        LIMIT $1`,
      [limit],
    );
    return (rows as Record<string, unknown>[]).map((r) => ({
      slug: String(r.slug),
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      author: String(r.author || "Team"),
      published_at: String(r.published_at),
      tags: normalizeTags(r.tags),
      hero_image_url: r.hero_image_url ? String(r.hero_image_url) : null,
      og_image_url: r.og_image_url ? String(r.og_image_url) : null,
    }));
  } catch {
    // Table may not exist yet on a fresh deploy — render an empty index
    // rather than 500 (mirrors the legal surface's "being prepared" rule).
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT slug, title, description, author, published_at, tags, hero_image_url, og_image_url, audio_url, content_html
         FROM blog_posts
        WHERE slug = $1 AND status = 'published'
        LIMIT 1`,
      [slug],
    );
    const r = rows[0] as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      slug: String(r.slug),
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      author: String(r.author || "Team"),
      published_at: String(r.published_at),
      tags: normalizeTags(r.tags),
      hero_image_url: r.hero_image_url ? String(r.hero_image_url) : null,
      og_image_url: r.og_image_url ? String(r.og_image_url) : null,
      audio_url: r.audio_url ? String(r.audio_url) : null,
      content_html: String(r.content_html),
    };
  } catch {
    return null;
  }
}
