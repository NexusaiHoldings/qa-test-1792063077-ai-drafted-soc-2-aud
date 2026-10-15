/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lego packages ship TS/TSX source (no build step) — Next must transpile
  // the ones whose UI components we render in the app (admin-console +
  // legal-and-compliance: LegalDocViewer / CookieBanner / AccessibilityStatement).
  transpilePackages: ["@nexus/admin-console", "@nexus/legal-and-compliance", "@nexus/notifications", "@nexus/billing-and-subscriptions", "@nexus/organizations-and-teams", "@nexus/support-and-help", "@nexus/crm-and-lifecycle", "@nexus/profile-and-account", "@nexus/onboarding", "@nexus/developer-surface", "@nexus/social-and-engagement", "@nexus/analytics-and-telemetry", "@nexus/files-and-media", "@nexus/search"],
  experimental: {
    typedRoutes: false,
    // `pg` ships Node-built-in deps (net/tls/pg-native) webpack can't bundle.
    // Externalizing keeps it out of the webpack bundle AND makes Next include
    // it in the serverless function's node_modules so route handlers can
    // require("pg") at runtime. Without this, the auth routes threw
    // "Cannot find module 'pg'" → caught by the lego as 500 "internal error".
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
