"use client";
import React from "react";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface AdminPageTemplateProps {
  title: string;
  breadcrumbs?: Breadcrumb[];
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  adminUserActions?: React.ReactNode;
}

export function AdminPageTemplate({
  title,
  breadcrumbs = [],
  actionButton,
  children,
  adminUserActions,
}: AdminPageTemplateProps) {
  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <nav style={{ marginBottom: 8, fontSize: 13, color: "#64748b" }}>
          {breadcrumbs.map((b, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: "0 6px" }}>›</span>}
              {b.href ? (
                <a href={b.href} style={{ color: "#1d4ed8", textDecoration: "none" }}>{b.label}</a>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", flex: 1 }}>{title}</h1>
        {actionButton}
      </div>

      {/* Slot: per-row user actions injected by other legos */}
      {adminUserActions}

      {/* Content */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 0, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
