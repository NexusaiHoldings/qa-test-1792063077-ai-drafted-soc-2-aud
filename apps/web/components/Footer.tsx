/**
 * Footer — site footer with standard legal links (legal-surface-mount-001).
 *
 * Server component. Links to the legal pages mounted from the
 * @nexus/legal-and-compliance lego (/terms, /privacy, /cookie-policy,
 * /accessibility) plus the company About page. The lego's `extra_legal_links`
 * slot (sub-processor lists, DPA, etc.) can be appended here in a follow-up.
 *
 * substrate-ui-baseline-001 (2026-06-09): rewritten off dead Tailwind classes
 * (the substrate has no Tailwind — those classes produced ZERO styling, so the
 * footer rendered flush-left + borderless). Styled via `footer` rules in
 * globals.css using the substrate design tokens, matching the TopNav approach.
 * Markup is now class-free semantic HTML.
 */
import Link from "next/link";

const FOOTER_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/help", label: "Help" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookie-policy", label: "Cookie Policy" },
  { href: "/accessibility", label: "Accessibility" },
];

export function Footer(): JSX.Element {
  const company = process.env.COMPANY_NAME || "This company";
  const year = new Date().getFullYear();
  return (
    <footer>
      <div>
        <span>
          © {year} {company}. All rights reserved.
        </span>
        <nav>
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
