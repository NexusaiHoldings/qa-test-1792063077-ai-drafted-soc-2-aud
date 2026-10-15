# Legal & Compliance — Slot Contracts

This document describes the slots exposed by the legal-and-compliance lego
and how other legos can fulfill or consume them.

## `extra_legal_links`

**Type:** `react-component`
**Consumer:** Site footer (rendered by the portfolio company's app shell)
**Purpose:** Inject additional legal/compliance navigation links alongside
the standard Terms / Privacy / Cookie Policy links.

### Contract

The component must render a React fragment (no wrapper div) of `<a>` elements
with the following props:
- `href`: relative path to the document (e.g. `/legal/terms`)
- `className`: accepts an optional className for styling consistency
- `children`: link text (e.g. "Sub-processor List")

### Example usage

```tsx
// legos/billing-and-subscriptions/ui/FooterLinks.tsx
export function BillingFooterLinks() {
  return (
    <>
      <a href="/legal/billing-terms">Billing Terms</a>
      <a href="/legal/refund-policy">Refund Policy</a>
    </>
  );
}
```

Register the component in the slot at lego install time:
```json
{ "slot": "extra_legal_links", "component": "BillingFooterLinks" }
```

---

## `policy_addendum_<doc_type>`

**Type:** `markdown-block`
**Variants:** `policy_addendum_terms_of_service`, `policy_addendum_privacy_policy`,
`policy_addendum_cookie_policy`, `policy_addendum_accessibility_statement`
**Consumer:** `LegalDocViewer` (appends addendum after main content)
**Purpose:** Allow another lego to inject company-specific clauses at the
end of a legal document without modifying the base template.

### Contract

The addendum is a Markdown string. It must:
- Begin with an `##` heading identifying the section source
  (e.g. `## Billing-specific Terms`)
- Not duplicate content already in the base template
- Be short (3-10 sentences or bullet points) — long addenda should be
  separate documents

### Example usage

```markdown
## Payment Processing Terms

Billing is handled by Stripe, Inc. By using paid features you agree to
Stripe's Connected Account Agreement at https://stripe.com/legal/ssa.
```

Register the addendum at lego install time:
```json
{
  "slot": "policy_addendum_terms_of_service",
  "content": "## Payment Processing Terms\n\nBilling is handled by..."
}
```

### Rendering order

When multiple legos contribute to the same addendum slot, they are rendered
in `lego.install_order` ascending (earliest installed lego first). Do not
rely on alphabetical ordering.
