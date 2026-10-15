import type { JSX } from "react";
import { AccessibilityStatement } from "@nexus/legal-and-compliance/ui/AccessibilityStatement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AccessibilityPage(): JSX.Element {
  const companyName = process.env.COMPANY_NAME || "This company";
  const domain = process.env.COMPANY_DOMAIN || "";
  const websiteUrl = domain ? `https://${domain}` : "/";
  const contactEmail =
    process.env.LEGAL_EMAIL ||
    process.env.SUPPORT_EMAIL ||
    (domain ? `support@${domain}` : "support@example.com");
  return (
    <AccessibilityStatement
      companyName={companyName}
      websiteUrl={websiteUrl}
      contactEmail={contactEmail}
      wcagLevel="AA"
    />
  );
}
