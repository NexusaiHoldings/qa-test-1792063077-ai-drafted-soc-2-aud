# Admin Console Slots

The admin-console lego exposes three slots that other legos can contribute to.

## `admin_nav_extra` (react-component)

Extra navigation items injected below the registered sections in the admin sidebar.

**When to use:** When your lego needs a persistent nav entry that is NOT its primary
admin section (e.g., a "Help" link, a global search shortcut).

**Contract:** Render a React fragment containing one or more `<a>` elements styled
to match the sidebar — typically `display: block; padding: 8px 16px`.

**Identity & Access example:** Identity & Access does not use this slot; its primary
entry appears via the sections registry. A future Help lego might inject a
"Documentation" link here.

---

## `admin_dashboard_widgets` (react-component)

Widgets rendered on the admin dashboard overview page, below the built-in
summary cards (total sections, recent flag changes, last config update).

**When to use:** When your lego has a metric or status summary that is valuable at
a glance for an admin — e.g., "Recent sign-ups last 7 days" from Identity & Access.

**Contract:** Each widget should be a self-contained card (roughly 280×160 px),
fetching its own data client-side. Do not depend on props from the shell.

---

## `admin_user_actions` (react-component)

Per-row action buttons in any admin table that renders users.

**When to use:** When your lego needs to add a privileged action to a user row —
e.g., "Force delete", "Revoke all sessions", "Reset MFA".

**Contract:** Receives `{ userId: string; userEmail: string }` as props. Renders
one or more `<button>` elements. On success, call the provided `onActionComplete()`
callback so the parent table can refresh.

**Identity & Access example:** Identity & Access's admin/routes.py exposes
`/admin/users/{id}/force-deletion` and `/admin/users/{id}/sessions/revoke-all`.
Its slot contribution renders two buttons that call these endpoints.
