# Admin Contribution Guide

Per NEXUS_PORTFOLIO_RUNTIME_SPEC §4.5, each lego contributes at most one primary
section to the admin console.

## Step 1 — Declare in your manifest

```yaml
admin:
  sections:
    - name: Billing
      order: 20
      permissions: [admin, owner]
      routes: [/admin/billing, "/admin/billing/{id}"]
```

Use `order` ≥ 20; admin-console reserves 10–12 for its own pages.

## Step 2 — Register at install time

```http
POST /api/admin/sections/register
X-Admin-Token: <token>

{"lego_name": "billing", "section_name": "Billing", "section_order": 20,
 "permissions": ["admin", "owner"], "routes": ["/admin/billing"]}
```

Idempotent — upserts on `(lego_name, section_name)`.

## Step 3 — Use AdminPageTemplate + AdminTable

```tsx
import { AdminPageTemplate, AdminTable, ColumnDef } from "@nexus/admin-console/ui/components";

export function BillingAdminPage() {
  const columns: ColumnDef<Invoice>[] = [
    { key: "id", header: "Invoice ID", sortable: true },
    { key: "amount", header: "Amount" },
  ];
  return (
    <AdminPageTemplate title="Billing" breadcrumbs={[{label:"Admin"},{label:"Billing"}]}>
      <AdminTable columns={columns} rows={invoices} loading={loading} />
    </AdminPageTemplate>
  );
}
```

Do NOT render admin pages outside `AdminPageTemplate`.

## Step 4 — Unregister on uninstall

```http
DELETE /api/admin/sections/billing
X-Admin-Token: <token>
```

## RBAC + Slots

AdminShell filters sections client-side by `permissions`. Your backend must also
enforce roles independently via Identity & Access session validation.

Use `admin_user_actions` slot for per-row buttons, `admin_nav_extra` for extra
sidebar items. See `docs/slots.md` for slot contracts.
