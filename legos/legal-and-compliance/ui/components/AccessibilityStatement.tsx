/**
 * AccessibilityStatement — renders the accessibility statement with WCAG 2.1
 * conformance level and contact info for accessibility issues.
 */
import React from "react";

interface AccessibilityStatementProps {
  companyName: string;
  websiteUrl: string;
  contactEmail: string;
  wcagLevel?: "A" | "AA" | "AAA";
  lastAuditDate?: string;
}

export function AccessibilityStatement({
  companyName,
  websiteUrl,
  contactEmail,
  wcagLevel = "AA",
  lastAuditDate,
}: AccessibilityStatementProps) {
  return (
    <article className="accessibility-statement max-w-3xl mx-auto py-8 px-4 prose prose-sm">
      <h1>Accessibility Statement</h1>
      <p>
        <strong>{companyName}</strong> is committed to ensuring digital accessibility
        for people with disabilities. We are continually improving the user experience
        for everyone and applying the relevant accessibility standards.
      </p>

      <h2>Conformance status</h2>
      <p>
        The Web Content Accessibility Guidelines (WCAG) define requirements for
        designers and developers to improve accessibility for people with disabilities.
        It defines three levels of conformance: Level A, Level AA, and Level AAA.
      </p>
      <p>
        <a href={websiteUrl} rel="noopener noreferrer">
          {websiteUrl}
        </a>{" "}
        is <strong>partially conformant</strong> with WCAG 2.1 Level {wcagLevel}. Partially
        conformant means that some parts of the content do not fully conform to the
        accessibility standard.
      </p>

      {lastAuditDate && (
        <p>
          This statement was last reviewed on{" "}
          <strong>
            {new Date(lastAuditDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </strong>
          .
        </p>
      )}

      <h2>Feedback and contact</h2>
      <p>
        We welcome feedback on the accessibility of {companyName}. If you experience
        accessibility barriers, please contact us:
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </li>
      </ul>
      <p>We try to respond to accessibility feedback within 2 business days.</p>

      <h2>Formal complaints</h2>
      <p>
        If you are not satisfied with our response, you may contact the relevant
        national authority responsible for enforcing accessibility legislation
        in your jurisdiction. [PLACEHOLDER — add jurisdiction-specific authority here.]
      </p>
    </article>
  );
}
