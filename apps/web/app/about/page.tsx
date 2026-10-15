/**
 * About page (legal-surface-mount-001 WS3).
 *
 * Marketing/company page — not owned by any lego. Populated from
 * COMPANY_NAME + COMPANY_DESCRIPTION env (injected at provision from the CEO
 * briefing's product_definition). Falls back gracefully if not set.
 */
import type { JSX } from "react";

export const dynamic = "force-dynamic";

export default function AboutPage(): JSX.Element {
  const company = process.env.COMPANY_NAME || "This company";
  const description = (process.env.COMPANY_DESCRIPTION || "").trim();
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-900">About {company}</h1>
      {description ? (
        <div className="mt-6 space-y-4 text-lg leading-relaxed text-gray-700">
          {description.split(/\n\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-gray-500">More about {company} is coming soon.</p>
      )}
    </main>
  );
}
