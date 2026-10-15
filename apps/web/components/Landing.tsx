/**
 * Landing — themed marketing page for landing-mode companies (company-root-landing-001).
 *
 * Server component, rendered inside <main> so it inherits the substrate theme +
 * element styling. Renders a hero (headline / subhead / CTAs / optional launch
 * video) + a feature-section grid + a closing CTA band, all from homeConfig
 * (provisioning-owned, generated from the plan). Falls back gracefully when a
 * field is missing so an undecided company still gets a real front door.
 */
import Link from "next/link";
import type { JSX } from "react";
import { homeConfig } from "@/lib/home/home-config";
import { NAV_CONFIG } from "@/lib/nav-config";
import { getSiteMedia } from "@/lib/site-media";
import { renderSection, type SectionContext } from "@/components/sections";

export async function Landing(): Promise<JSX.Element> {
  const name = process.env.COMPANY_NAME || "Portfolio Company";
  const launchVideo = await getSiteMedia("launch_video");
  const heroImage = await getSiteMedia("hero_image");

  const firstNavRoute = NAV_CONFIG.primary.find((l) => l.href !== "/");
  const fallbackCta = homeConfig.primaryCta
    || (firstNavRoute ? { label: firstNavRoute.label, href: firstNavRoute.href } : { label: "Get started", href: "/assistant" });

  // Bespoke composition (homepage-composition-001): when the composer produced a
  // section sequence, render it in order and let each block pull what it needs.
  // The legacy single-layout below is the fallback for un-composed companies.
  if (homeConfig.sections && homeConfig.sections.length > 0) {
    const ctx: SectionContext = { heroImage, fallbackCta };
    return (
      <>
        {homeConfig.sections.map((s, i) => renderSection(s, i, ctx))}
        {launchVideo ? (
          <video controls playsInline preload="metadata"
            style={{ width: "100%", marginTop: "2.5rem", borderRadius: "var(--substrate-radius-lg)", border: "1px solid var(--substrate-border)", boxShadow: "var(--substrate-shadow)", aspectRatio: "16 / 9", objectFit: "cover" }}
            src={launchVideo}>
            Your browser does not support the video element.
          </video>
        ) : null}
      </>
    );
  }

  const headline = homeConfig.headline || name;
  const subhead =
    homeConfig.subhead ||
    process.env.COMPANY_DESCRIPTION ||
    `Welcome to ${name}.`;

  const firstNav = NAV_CONFIG.primary.find((l) => l.href !== "/");
  const primary =
    homeConfig.primaryCta ||
    (firstNav
      ? { label: firstNav.label, href: firstNav.href }
      : { label: "Get started", href: "/assistant" });
  const secondary = homeConfig.secondaryCta;
  const features = homeConfig.features || [];

  const heroCopy = (
    <div style={{ flex: "1 1 360px", minWidth: 0 }}>
      <span className="eyebrow">{name}</span>
      <h1 style={{ fontSize: "2.6rem", lineHeight: 1.1, marginBottom: "0.75rem", letterSpacing: "-0.02em" }}>
        {headline}
      </h1>
      <p
        style={{
          fontSize: "1.15rem",
          color: "var(--substrate-muted)",
          marginBottom: "1.75rem",
        }}
      >
        {subhead}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={primary.href} className="btn">
          {primary.label}
        </Link>
        {secondary ? (
          <Link href={secondary.href} className="btn secondary">
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Image-forward hero: brand-grounded hero image (mood-board-generated) beside
          the copy on wide screens, stacked on narrow. Falls back to copy-only. */}
      <section style={{ padding: "32px 0 8px" }}>
        <div
          style={{
            display: "flex",
            gap: 32,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {heroCopy}
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt={`${name} — brand hero`}
              style={{
                flex: "1 1 380px",
                minWidth: 0,
                width: "100%",
                maxWidth: 560,
                borderRadius: "var(--substrate-radius-lg)",
                border: "1px solid var(--substrate-border)",
                boxShadow: "var(--substrate-shadow-lg)",
                aspectRatio: "3 / 2",
                objectFit: "cover",
              }}
            />
          ) : null}
        </div>
        {launchVideo ? (
          <video
            controls
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              marginTop: "2rem",
              borderRadius: 12,
              border: "1px solid var(--substrate-border)",
              aspectRatio: "16 / 9",
              objectFit: "cover",
            }}
            src={launchVideo}
          >
            Your browser does not support the video element.
          </video>
        ) : null}
      </section>

      {features.length > 0 ? (
        <section style={{ padding: "40px 0 8px" }}>
          {homeConfig.featuresTitle ? (
            <h2
              style={{
                fontSize: "1.6rem",
                marginBottom: "1.5rem",
                lineHeight: 1.2,
              }}
            >
              {homeConfig.featuresTitle}
            </h2>
          ) : null}
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {features.map((f, i) => (
              <div key={i} className="feature-card">
                <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem", lineHeight: 1.25 }}>
                  {f.title}
                </h3>
                <p style={{ color: "var(--substrate-muted)", fontSize: "0.98rem", lineHeight: 1.5 }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {homeConfig.closingHeadline ? (
        <section
          className="cta-band"
          style={{
            margin: "48px 0 24px",
            padding: "44px 28px",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1.25rem", lineHeight: 1.25 }}>
            {homeConfig.closingHeadline}
          </h2>
          <Link href={primary.href} className="btn">
            {primary.label}
          </Link>
        </section>
      ) : null}
    </>
  );
}
