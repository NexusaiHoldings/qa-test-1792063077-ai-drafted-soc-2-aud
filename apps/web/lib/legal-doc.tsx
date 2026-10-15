/**
 * Shared server helper for the public legal pages (legal-surface-mount-001).
 *
 * Fetches the currently-effective document of a given type from the legal lego
 * (reads the company's own DB via the handler) and renders it with the lego's
 * LegalDocViewer. Falls back to a "being prepared" notice if no doc is
 * published yet (so the page never 500s pre-generation).
 */
import type { JSX } from "react";
import { handleListDocuments } from "@nexus/legal-and-compliance";
import { LegalDocViewer } from "@nexus/legal-and-compliance/ui/LegalDocViewer";
import { buildDb } from "@/lib/db";
import { buildEventBus } from "@/lib/events";

interface DocRow {
  doc_type: string;
  version: string;
  jurisdiction: string;
  effective_at: string;
  content_html: string;
  content_summary?: string;
}

export async function renderLegalDoc(docType: string, title: string): Promise<JSX.Element> {
  const result = await handleListDocuments({
    query: { doc_type: docType, jurisdiction: process.env.LEGAL_JURISDICTION || "us" },
    ctx: { db: buildDb(), events: buildEventBus() },
  });
  const body = typeof result.body === "object" ? (result.body as { documents?: DocRow[] }) : {};
  const doc = body.documents?.[0];
  if (!doc) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-4 text-gray-500">
          This document is being prepared and will be available shortly.
        </p>
      </main>
    );
  }
  return (
    <LegalDocViewer
      docType={doc.doc_type}
      version={doc.version}
      jurisdiction={doc.jurisdiction}
      effectiveAt={doc.effective_at}
      contentHtml={doc.content_html}
      contentSummary={doc.content_summary}
    />
  );
}
