/**
 * Site media schema (visual-audio-video-team-001 phase 5).
 *
 * Substrate-owned key→url store for company-level brand media the Nexus
 * marketing visual team produces (launch teaser video, default OG card, etc.).
 * The asset bytes live centrally in nexus_v2.generated_assets and are served at
 * {RUNTIME}/assets/<id>; this table just holds the public URL the live site
 * reads (parallel to blog_posts.hero_image_url). Picked up by migrate.ts via the
 * *_DDL convention.
 */
export const SITE_MEDIA_DDL = `
CREATE TABLE IF NOT EXISTS site_media (
  key text PRIMARY KEY,
  url text NOT NULL,
  mime text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
