/**
 * LegalDocViewer — renders an HTML legal document with version + effective_at metadata.
 * Content is sanitized: dangerouslySetInnerHTML is used but inline scripts are stripped
 * server-side before storage. Client-side sanitization via a simple regex guard.
 */
import React from "react";

interface LegalDocViewerProps {
  docType: string;
  version: string;
  jurisdiction: string;
  effectiveAt: string;
  contentHtml: string;
  contentSummary?: string;
}

function sanitize(html: string): string {
  // Strip inline event handlers and <script> tags as a belt-and-suspenders guard.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-removed=");
}

const DOC_TYPE_LABELS: Record<string, string> = {
  terms_of_service: "Terms of Service",
  privacy_policy: "Privacy Policy",
  cookie_policy: "Cookie Policy",
  accessibility_statement: "Accessibility Statement",
};

export function LegalDocViewer({
  docType,
  version,
  jurisdiction,
  effectiveAt,
  contentHtml,
  contentSummary,
}: LegalDocViewerProps) {
  const label = DOC_TYPE_LABELS[docType] ?? docType.replace(/_/g, " ");
  const formattedDate = new Date(effectiveAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="legal-doc-viewer max-w-3xl mx-auto py-8 px-4">
      <header className="mb-6 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{label}</h1>
        <div className="mt-2 flex gap-4 text-sm text-gray-500">
          <span>Version {version}</span>
          <span>·</span>
          <span>Effective {formattedDate}</span>
          <span>·</span>
          <span className="uppercase">{jurisdiction}</span>
        </div>
        {contentSummary && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded p-3 border-l-4 border-blue-400">
            <strong>Summary: </strong>{contentSummary}
          </p>
        )}
      </header>

      <div
        className="prose prose-sm max-w-none text-gray-700"
        dangerouslySetInnerHTML={{ __html: sanitize(contentHtml) }}
      />

      <footer className="mt-10 pt-4 border-t border-gray-100 text-xs text-gray-400">
        This document was last updated on {formattedDate}. Continued use of the service
        constitutes acceptance of this {label}.
      </footer>
    </article>
  );
}
