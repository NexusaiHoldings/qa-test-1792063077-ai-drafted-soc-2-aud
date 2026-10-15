/**
 * AdminLegalPage — admin contribution for legal document management.
 * Uses AdminPageTemplate + AdminTable from admin-console per ADR 0010.
 * Lists docs, shows version history, provides "Publish New Version" button.
 */
"use client";
import React, { useEffect, useState } from "react";

// Consumed from admin-console lego — do not duplicate
import { AdminPageTemplate } from "../../../admin-console/ui/components/AdminPageTemplate";
import { AdminTable } from "../../../admin-console/ui/components/AdminTable";

interface LegalDoc {
  id: string;
  doc_type: string;
  version: string;
  jurisdiction: string;
  effective_at: string;
  content_summary?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  terms_of_service: "Terms of Service",
  privacy_policy: "Privacy Policy",
  cookie_policy: "Cookie Policy",
  accessibility_statement: "Accessibility Statement",
};

export function AdminLegalPage() {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = () => {
    setLoading(true);
    fetch("/admin/legal/documents", { headers: { "X-Admin-Token": window.__ADMIN_TOKEN__ ?? "" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => { setDocs(data.documents ?? []); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);

  const columns = [
    {
      key: "doc_type",
      label: "Document",
      render: (doc: LegalDoc) => DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type,
    },
    { key: "version", label: "Version" },
    { key: "jurisdiction", label: "Jurisdiction" },
    {
      key: "effective_at",
      label: "Effective",
      render: (doc: LegalDoc) =>
        new Date(doc.effective_at).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric",
        }),
    },
    { key: "content_summary", label: "Summary" },
  ];

  return (
    <AdminPageTemplate
      title="Legal Documents"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Legal" }]}
      action={{ label: "Publish New Version", href: "/admin/legal/publish" }}
    >
      {error && (
        <div className="mb-4 rounded bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <AdminTable
        columns={columns}
        rows={docs}
        loading={loading}
        emptyMessage="No legal documents found. Publish a document to get started."
        onRowClick={(doc) => { window.location.href = `/admin/legal/documents/${doc.doc_type}`; }}
      />
    </AdminPageTemplate>
  );
}

declare global {
  interface Window { __ADMIN_TOKEN__?: string; }
}
