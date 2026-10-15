import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TopNav } from "@/components/topnav";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@nexus/legal-and-compliance/ui/CookieBanner";
import { SupportWidget } from "@nexus/support-and-help/ui/SupportWidget";
import { FeedbackWidget } from "@nexus/feedback/ui/FeedbackWidget";
import { getSessionUser } from "@/lib/admin-auth";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CommandPalette } from "@/components/CommandPalette";
import { activeTheme } from "@/lib/theme/active-theme";
import { fontHref, fontStack } from "@/lib/theme/registry";
import type { ThemeContract } from "@/lib/theme/contract";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.COMPANY_NAME || "Portfolio Company",
  description: "Powered by Nexus portfolio substrate",
};

/**
 * company-theme-authoring-001: emit the company's resolved ThemeContract as a
 * :root override of the substrate --substrate-* CSS variables. Loaded after
 * globals.css (so it overrides the defaults). Cosmetic tokens only.
 */
function rootThemeCss(t: ThemeContract): string {
  const c = t.color;
  const decls = [
    ["--substrate-bg", c.bg],
    ["--substrate-fg", c.text],
    ["--substrate-muted", c.textMuted],
    ["--substrate-accent", c.accent],
    ["--substrate-accent-text", c.accentText],
    ["--substrate-danger", c.danger],
    ["--substrate-success", c.success],
    ["--substrate-border", c.border],
    ["--substrate-border-strong", c.borderStrong],
    ["--substrate-surface", c.surface],
    ["--substrate-surface-2", c.surfaceAlt],
    ["--substrate-radius", `${t.shape.radius}px`],
    ["--substrate-font-body", fontStack(t.type.fontBody)],
    ["--substrate-font-heading", fontStack(t.type.fontHeading)],
  ];
  return `:root{${decls.map(([k, v]) => `${k}:${v}`).join(";")}}`;
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const themeFontHref = fontHref(activeTheme.type.fontHeading, activeTheme.type.fontBody);
  // Feedback FAB is for signed-in users only (cookie-gated; no DB hit when anon).
  const sessionUser = await getSessionUser();
  return (
    <html lang="en">
      <body>
        {themeFontHref ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={themeFontHref} />
          </>
        ) : null}
        <style dangerouslySetInnerHTML={{ __html: rootThemeCss(activeTheme) }} />
        <TopNav />
        <main>{children}</main>
        <Footer />
        <CookieBanner />
        {/* Floating support launcher (substrate-lego-wiring-001). user_id is
            attributed server-side by the /api/support/tickets shim from the
            session, so the widget works anonymously too. */}
        <SupportWidget />
        {/* Feedback → Build FAB (feedback-to-build-loop-001). Signed-in only;
            user attribution is resolved server-side by /api/feedback. */}
        {sessionUser ? <FeedbackWidget /> : null}
        <AnalyticsBeacon />
        <CommandPalette />
      </body>
    </html>
  );
}
