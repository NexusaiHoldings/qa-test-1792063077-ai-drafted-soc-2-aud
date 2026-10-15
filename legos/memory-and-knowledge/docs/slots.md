# Memory & Knowledge — Slot Reference

## `admin_memory_inspector` (react-component)
Admin-console pane showing the last N memories for one portfolio company.
Renders three stacked sections: Long-term (with discipline / type /
importance / retrieval count / contradiction count / status badges), Working
(with TTL countdown), and Recent GDPR forget actions.

Wire-up:
```tsx
import { MemoryInspector } from "@nexus/memory-and-knowledge";
<MemoryInspector portfolioCompanyId={companyId} apiBaseUrl="/api" limit={50} />
```

## `user_memory_export` (react-component)
User-facing GDPR controls — "Download my memory" exports the user's long-term
memories as JSON; "Forget me" deletes everything (with two-click confirmation).

Wire-up:
```tsx
import { UserMemoryExport } from "@nexus/memory-and-knowledge";
<UserMemoryExport
  portfolioCompanyId={companyId}
  portfolioUserId={userId}
  onForgotten={() => router.push("/goodbye")}
/>
```

## Composition example (admin shell)
```tsx
// Inside the admin console's company-detail page
<section>
  <h2>Memory</h2>
  <MemoryInspector portfolioCompanyId={company.id} />
</section>
```
