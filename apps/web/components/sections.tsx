/**
 * Homepage section library (homepage-composition-001).
 *
 * A vetted, theme-aware set of marketing-page section blocks. The composer agent
 * picks a per-company SEQUENCE of these and writes their content; Landing.tsx maps
 * each section's `type` to the component here via renderSection(). Every block is a
 * server component styled with the substrate's --substrate-* tokens + enriched
 * primitives (.eyebrow / .feature-card / .pill / .surface / .cta-band), so it
 * inherits each company's ThemeContract and the §3A depth/motion baseline.
 *
 * Design intent: generous spacing, clear hierarchy (eyebrow → title → body),
 * real depth (cards + shadows), purposeful accent, and image-forward blocks —
 * the dimensions the design-QA gate scores.
 */
import Link from "next/link";
import { Fragment } from "react";
import type { JSX } from "react";
import type {
  HomeSection,
  HomeCta,
  SectionImage,
  HeroSection,
  StatsSection,
  HowItWorksSection,
  FeatureGridSection,
  FeatureSpotlightSection,
  SocialProofSection,
  FaqSection,
  PricingTeaserSection,
  GallerySection,
  CtaBandSection,
} from "@/lib/home/home-config";

/** Render-time context Landing passes in (async-resolved values + fallbacks). */
export interface SectionContext {
  /** site_media('hero_image') URL, or null. Used when a section image is omitted
   *  or set to the literal "hero_image". */
  heroImage?: string | null;
  /** A guaranteed-valid CTA (first nav route) for sections that omit their own. */
  fallbackCta: HomeCta;
}

const SECTION_GAP = 72; // vertical rhythm between sections

function resolveImage(img: SectionImage | undefined, ctx: SectionContext): string | null {
  if (img?.url && img.url !== "hero_image" && /^https?:\/\//.test(img.url)) return img.url;
  // Only the literal "hero_image" token resolves to the shared hero image. A
  // section item with NO image renders text-only — never reuse the hero across
  // sections (that read as "generic, repetitive imagery" and tanked the score).
  if (img?.url === "hero_image") return ctx.heroImage || null;
  return null;
}

function SectionHeading({ eyebrow, title, subhead }: { eyebrow?: string; title?: string; subhead?: string }): JSX.Element | null {
  if (!title && !eyebrow) return null;
  return (
    <div style={{ maxWidth: 720, marginBottom: 36 }}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      {title ? <h2 style={{ fontSize: "1.9rem", lineHeight: 1.18, letterSpacing: "-0.02em", marginBottom: subhead ? "0.6rem" : 0 }}>{title}</h2> : null}
      {subhead ? <p style={{ fontSize: "1.1rem", color: "var(--substrate-muted)", lineHeight: 1.5 }}>{subhead}</p> : null}
    </div>
  );
}

function Hero(s: HeroSection, ctx: SectionContext): JSX.Element {
  const img = resolveImage(s.image, ctx);
  const primary = s.primaryCta || ctx.fallbackCta;
  // Hero text is LEFT-aligned (NOT center-justified). With an image: 2-column
  // text-left + image-right. Without an image: the text column fills the width
  // but the readable copy + CTAs stay left-aligned (chairman direction
  // 2026-06-24 — headlines read best left-aligned; centering is for the button
  // LABELS, handled by .btn).
  return (
    <section style={{ padding: "40px 0 8px" }}>
      <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", minWidth: 0 }}>
          {s.eyebrow ? <span className="eyebrow">{s.eyebrow}</span> : null}
          <h1 style={{ fontSize: "2.9rem", lineHeight: 1.06, letterSpacing: "-0.025em", marginBottom: "0.9rem" }}>
            {s.headline}
          </h1>
          {s.subhead ? (
            <p style={{ fontSize: "1.2rem", color: "var(--substrate-muted)", lineHeight: 1.5, marginBottom: "1.9rem", maxWidth: 560 }}>
              {s.subhead}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href={primary.href} className="btn">{primary.label}</Link>
            {s.secondaryCta ? <Link href={s.secondaryCta.href} className="btn secondary">{s.secondaryCta.label}</Link> : null}
          </div>
        </div>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={s.image?.alt || s.headline}
            style={{
              flex: "1 1 400px", minWidth: 0, width: "100%", maxWidth: 580,
              borderRadius: "var(--substrate-radius-lg)", border: "1px solid var(--substrate-border)",
              boxShadow: "var(--substrate-shadow-lg)", aspectRatio: "3 / 2", objectFit: "cover",
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function Stats(s: StatsSection): JSX.Element {
  return (
    <section className="surface" style={{ marginTop: SECTION_GAP }}>
      {s.title ? <h2 style={{ fontSize: "1.4rem", marginBottom: 24, lineHeight: 1.2 }}>{s.title}</h2> : null}
      <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {s.stats.map((st, i) => (
          <div key={i}>
            <div style={{ fontSize: "2.4rem", fontWeight: 750, lineHeight: 1, color: "var(--substrate-accent)", letterSpacing: "-0.02em" }}>{st.value}</div>
            <div style={{ color: "var(--substrate-muted)", marginTop: 8, fontSize: "0.98rem" }}>{st.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks(s: HowItWorksSection): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title || "How it works"} subhead={s.subhead} />
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {s.steps.map((step, i) => (
          <div key={i} className="card lift" style={{ marginBottom: 0 }}>
            <div className="pill" style={{ marginBottom: 14 }}>Step {i + 1}</div>
            <h3 style={{ fontSize: "1.15rem", marginBottom: "0.5rem", lineHeight: 1.25 }}>{step.title}</h3>
            <p style={{ color: "var(--substrate-muted)", fontSize: "1.05rem", lineHeight: 1.65 }}>{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureGrid(s: FeatureGridSection): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title} subhead={s.subhead} />
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {s.features.map((f, i) => (
          <div key={i} className="feature-card">
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem", lineHeight: 1.25 }}>{f.title}</h3>
            <p style={{ color: "var(--substrate-muted)", fontSize: "1.05rem", lineHeight: 1.65 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureSpotlight(s: FeatureSpotlightSection, ctx: SectionContext): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title} />
      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        {s.items.map((it, i) => {
          const img = resolveImage(it.image, ctx);
          const reverse = i % 2 === 1;
          return (
            <div key={i} style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap", flexDirection: reverse ? "row-reverse" : "row" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <h3 style={{ fontSize: "1.5rem", marginBottom: "0.6rem", lineHeight: 1.2, letterSpacing: "-0.01em" }}>{it.title}</h3>
                <p style={{ color: "var(--substrate-muted)", fontSize: "1.05rem", lineHeight: 1.6 }}>{it.body}</p>
              </div>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={it.image?.alt || it.title}
                  style={{ flex: "1 1 360px", minWidth: 0, width: "100%", maxWidth: 520, borderRadius: "var(--substrate-radius-lg)", border: "1px solid var(--substrate-border)", boxShadow: "var(--substrate-shadow)", aspectRatio: "3 / 2", objectFit: "cover" }} />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SocialProof(s: SocialProofSection): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title} />
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {s.quotes.map((q, i) => (
          <figure key={i} className="card" style={{ marginBottom: 0 }}>
            <blockquote style={{ fontSize: "1.1rem", lineHeight: 1.55, margin: 0 }}>“{q.quote}”</blockquote>
            {(q.author || q.role) ? (
              <figcaption style={{ marginTop: 16, color: "var(--substrate-muted)", fontSize: "0.92rem" }}>
                {q.author ? <strong style={{ color: "var(--substrate-fg)" }}>{q.author}</strong> : null}
                {q.author && q.role ? " · " : ""}{q.role || ""}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

function Faq(s: FaqSection): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP, maxWidth: 760 }}>
      <SectionHeading title={s.title || "Frequently asked questions"} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {s.items.map((it, i) => (
          <details key={i} className="card" style={{ marginBottom: 0 }}>
            <summary style={{ fontWeight: 600, cursor: "pointer", fontSize: "1.02rem" }}>{it.q}</summary>
            <p style={{ color: "var(--substrate-muted)", marginTop: 10, lineHeight: 1.6, marginBottom: 0 }}>{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function PricingTeaser(s: PricingTeaserSection, ctx: SectionContext): JSX.Element {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title || "Pricing"} subhead={s.subhead} />
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {s.tiers.map((t, i) => {
          const cta = t.cta || ctx.fallbackCta;
          return (
            <div key={i} className="card lift" style={{ marginBottom: 0, borderColor: t.highlighted ? "var(--substrate-accent)" : undefined, boxShadow: t.highlighted ? "var(--substrate-shadow-lg)" : undefined }}>
              {t.highlighted ? <div className="pill" style={{ marginBottom: 12 }}>Most popular</div> : null}
              <h3 style={{ fontSize: "1.2rem", marginBottom: 8 }}>{t.name}</h3>
              {t.price ? (
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 750, letterSpacing: "-0.02em" }}>{t.price}</span>
                  {t.period ? <span style={{ color: "var(--substrate-muted)" }}> /{t.period}</span> : null}
                </div>
              ) : null}
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                {t.features.map((f, j) => (
                  <li key={j} style={{ color: "var(--substrate-muted)", fontSize: "1rem", lineHeight: 1.5, paddingLeft: 22, position: "relative", marginBottom: 2 }}>
                    <span style={{ position: "absolute", left: 0, color: "var(--substrate-success)" }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href={cta.href} className={t.highlighted ? "btn" : "btn secondary"} style={{ display: "inline-block" }}>{cta.label}</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Gallery(s: GallerySection, ctx: SectionContext): JSX.Element {
  const imgs = s.images.map((im) => ({ url: resolveImage(im, ctx), caption: im.caption, alt: im.alt })).filter((im) => im.url);
  if (!imgs.length) return <></>;
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <SectionHeading title={s.title} />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {imgs.map((im, i) => (
          <figure key={i} style={{ margin: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url as string} alt={im.alt || ""} style={{ width: "100%", borderRadius: "var(--substrate-radius)", border: "1px solid var(--substrate-border)", boxShadow: "var(--substrate-shadow-sm)", aspectRatio: "4 / 3", objectFit: "cover" }} />
            {im.caption ? <figcaption style={{ color: "var(--substrate-muted)", fontSize: "0.88rem", marginTop: 8 }}>{im.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

function CtaBand(s: CtaBandSection, ctx: SectionContext): JSX.Element {
  const cta = s.cta || ctx.fallbackCta;
  return (
    <section className="cta-band" style={{ marginTop: SECTION_GAP, padding: "52px 32px", textAlign: "center" }}>
      <h2 style={{ fontSize: "1.7rem", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: s.subhead ? "0.6rem" : "1.4rem" }}>{s.headline}</h2>
      {s.subhead ? <p style={{ color: "var(--substrate-muted)", fontSize: "1.05rem", maxWidth: 560, margin: "0 auto 1.6rem" }}>{s.subhead}</p> : null}
      <Link href={cta.href} className="btn">{cta.label}</Link>
    </section>
  );
}

/** Map a section to its component. Unknown types render nothing (forward-compat). */
export function renderSection(section: HomeSection, i: number, ctx: SectionContext): JSX.Element {
  let el: JSX.Element;
  switch (section.type) {
    case "hero": el = Hero(section, ctx); break;
    case "stats": el = Stats(section); break;
    case "how_it_works": el = HowItWorks(section); break;
    case "feature_grid": el = FeatureGrid(section); break;
    case "feature_spotlight": el = FeatureSpotlight(section, ctx); break;
    case "social_proof": el = SocialProof(section); break;
    case "faq": el = Faq(section); break;
    case "pricing_teaser": el = PricingTeaser(section, ctx); break;
    case "gallery": el = Gallery(section, ctx); break;
    case "cta_band": el = CtaBand(section, ctx); break;
    default: return <Fragment key={i} />;
  }
  return <Fragment key={i}>{el}</Fragment>;
}
