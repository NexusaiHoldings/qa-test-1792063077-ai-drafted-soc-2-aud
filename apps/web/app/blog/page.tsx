/**
 * Blog index (gtm-marketing-launch-001).
 *
 * Lists published posts from the company's own blog_posts table. Plain
 * semantic markup — styling comes from the substrate ui-baseline element
 * defaults scoped under `main` (substrate-ui-baseline-001; no Tailwind).
 */
import type { JSX } from "react";
import Link from "next/link";
import { listPublishedPosts } from "@/lib/blog";
import { getSiteMedia } from "@/lib/site-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function BlogIndexPage(): Promise<JSX.Element> {
  const company = process.env.COMPANY_NAME || "our";
  const posts = await listPublishedPosts();
  const launchVideo = await getSiteMedia("launch_video");
  return (
    <main>
      <h1>Blog</h1>
      {launchVideo ? (
        <video
          controls
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            borderRadius: 10,
            marginBottom: 24,
            aspectRatio: "16 / 9",
            objectFit: "cover",
            border: "1px solid var(--substrate-border)",
          }}
          src={launchVideo}
        >
          Your browser does not support the video element.
        </video>
      ) : null}
      {posts.length === 0 ? (
        <p className="empty">
          No posts yet — the {company} blog is just getting started.
        </p>
      ) : (
        <div>
          {posts.map((p) => (
            <article key={p.slug} className="card">
              {p.hero_image_url ? (
                <Link href={`/blog/${p.slug}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.hero_image_url}
                    alt={p.title}
                    style={{ width: "100%", borderRadius: 8, marginBottom: 12, aspectRatio: "16 / 9", objectFit: "cover" }}
                  />
                </Link>
              ) : null}
              <h2>
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p>
                <small>
                  {formatDate(p.published_at)} · {p.author}
                </small>
              </p>
              {p.description ? <p>{p.description}</p> : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
