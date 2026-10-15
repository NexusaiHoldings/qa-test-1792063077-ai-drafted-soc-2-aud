/**
 * Blog posts schema (gtm-marketing-launch-001).
 *
 * Substrate-owned (not a lego, not agent territory): the Nexus marketing
 * engine publishes posts into the company's own DB and /blog renders them.
 * Picked up by packages/db/migrate.ts via the *_DDL constant convention.
 */
export const BLOG_DDL = `
CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  content_html text NOT NULL,
  content_md text,
  hero_image_url text,
  og_image_url text,
  audio_url text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  author text NOT NULL DEFAULT 'Team',
  status text NOT NULL DEFAULT 'published',
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON blog_posts (published_at DESC) WHERE status = 'published';
-- Backfill columns for companies whose blog_posts predates them
-- (CREATE TABLE IF NOT EXISTS won't add them to an existing table).
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS og_image_url text;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS audio_url text;
`;
